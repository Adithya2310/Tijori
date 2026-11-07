import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withLocalStore } from '@tijori/server/storage/local-file';
import { migrateLocalToArkiv } from '@tijori/server/storage/migrate-local';
import { applyAction } from '@tijori/core/vault';

test('migration preview preserves source bytes, counts records and rejects extra secret fields', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'tijori-migrate-local-'));
 try {
  await withLocalStore(async store => {
   const previous = await store.read();
   applyAction(previous.vault, 'signup', { name: 'Synthetic', address: '0x' + '1'.repeat(40), objectName: 'fixture', keyEnvelope: { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) } });
   await store.write(previous.vault, previous);
  }, directory);
  const before = await readFile(join(directory, 'state.json'));
  const key = await readFile(join(directory, 'encryption.key'));
  const preview = await migrateLocalToArkiv(directory);
  assert.equal(preview.migrated, false);
  assert.equal(preview.wallets, 1);
  assert.deepEqual(await readFile(join(directory, 'state.json')), before);
  assert.deepEqual(await readFile(join(directory, 'encryption.key')), key);
  await withLocalStore(async store => {
   const previous = await store.read();
   Object.assign(previous.vault.wallets[0], { privateKey: 'must-stay-local' });
   await store.write(previous.vault, previous);
  }, directory);
  await assert.rejects(migrateLocalToArkiv(directory, true), /unsupported fields/);
  await writeFile(join(directory, 'state.json'), '{}');
  await assert.rejects(migrateLocalToArkiv(directory), /invalid/);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('migration never initializes an empty or missing local store', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'tijori-no-init-'));
 try {
  await assert.rejects(migrateLocalToArkiv(directory), /encryption key is required/);
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(migrateLocalToArkiv(join(directory, 'missing')));
  assert.deepEqual(await readdir(directory), []);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
