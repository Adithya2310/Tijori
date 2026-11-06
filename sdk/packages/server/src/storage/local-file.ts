import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { durableJson, StorageError } from './arkiv.ts';
import { encryptState, decryptState } from './codec.ts';
import { LEGACY_LOCAL_STORE_CONTEXT } from '@tijori/core/legacy';
import { setting } from '../context.ts';
import { emptyVault, VaultError } from '@tijori/core/vault';
import type { StateStore } from '@tijori/core/state-store';

const context = LEGACY_LOCAL_STORE_CONTEXT;
// Explicit opt-in storage, independent of Arkiv credentials, journals and namespaces.
export async function withLocalStore<T>(work: (store: StateStore) => Promise<T>, directory = setting('LOCAL_DEMO_DATA_DIR') || join(process.cwd(), 'data', 'local-demo')): Promise<T> {
 try { await mkdir(directory, { recursive: true, mode: 0o700 }); }
 catch { throw new StorageError('Cannot open the local demo data directory.'); }
 const lockPath = join(directory, 'state.lock');
 let lock;
 for (let i = 0; i < 100; i++) {
  try { lock = await open(lockPath, 'wx', 0o600); break; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw new StorageError('Cannot lock local demo storage.'); await new Promise(resolve => setTimeout(resolve, 100)); }
 }
 if (!lock) throw new StorageError('Local demo storage is busy. Inspect state.lock if the previous server stopped unexpectedly.');
 try {
  await lock.writeFile(String(process.pid));
  const keyPath = join(directory, 'encryption.key'), statePath = join(directory, 'state.json');
  let key: Buffer;
  try { key = await readFile(keyPath); }
  catch (e) {
   if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
   // Refuse to replace a lost key if a database already exists.
   try { await readFile(statePath); throw new StorageError('The local encryption key is missing. Restore it; state will not be reset.'); }
   catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   key = randomBytes(32);
   const file = await open(keyPath, 'wx', 0o600);
   try { await file.writeFile(key); await file.sync(); } finally { await file.close(); }
   await durableJson(statePath, { version: 1, revision: '0', ciphertext: encryptState(emptyVault(), key, context).toString('hex') });
  }
  if (key.length !== 32) throw new StorageError('The local encryption key is invalid. Restore it; state will not be reset.');
  const read: StateStore['read'] = async () => {
   const record = JSON.parse(await readFile(statePath, 'utf8'));
   if (record.version !== 1 || typeof record.revision !== 'string' || !/^\d+$/.test(record.revision) || typeof record.ciphertext !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(record.ciphertext)) throw new StorageError('Local demo state is invalid. Restore the database; it will not be reset.');
   return { vault: decryptState(Buffer.from(record.ciphertext, 'hex'), key, context), revision: BigInt(record.revision), entityKey: undefined };
  };
  return await work({ read, write: async (vault, previous) => {
   const current = await read();
   if (current.revision !== previous.revision) throw new StorageError('Local state changed. Refresh before retrying.');
   await durableJson(statePath, { version: 1, revision: String(current.revision + 1n), ciphertext: encryptState(vault, key, context).toString('hex') });
  } });
 } catch (e) {
  if (e instanceof StorageError || e instanceof VaultError) throw e;
  throw new StorageError('Local demo storage failed. Check the database and encryption key; nothing was reset.');
 } finally {
  try { await lock.close(); await unlink(lockPath); }
  catch { throw new StorageError('Could not release the local storage lock. Inspect state.lock before retrying.'); }
 }
}
