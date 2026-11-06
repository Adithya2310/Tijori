#!/usr/bin/env node
// tijori-server: operator commands for the Arkiv-backed state.
//   tijori-server arkiv check | migrate | verify-write      (reads .env from the working directory if present)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSqliteVault } from './storage/migrate-sqlite.ts';
import { withArkiv, StorageError } from './storage/arkiv.ts';
import { validateVault } from '@tijori/core/vault';
import { setting } from './context.ts';
for (const file of ['.env.local', '.env']) if (existsSync(file)) process.loadEnvFile(file);
const args = process.argv.slice(2);
const mode = args[0] === 'arkiv' ? args[1] : args[0];
try {
 await withArkiv(async store => {
  if (mode === 'check') {
   const balance = await store.reader.getBalance({ address: store.address, blockTag: 'latest' });
   const state = await store.read();
   console.log(JSON.stringify({ chainId: 7794095, address: store.address, balanceWei: balance.toString(), wallets: state.vault.wallets.length, groups: state.vault.groups.length, transactions: state.vault.transactions.length, ...store.journal() }, null, 2));
  } else if (mode === 'verify-write') {
   const previous = await store.read();
   if (!previous.entityKey) throw new StorageError('Migrate or create the vault before verifying updates.');
   await store.write(previous.vault, previous);
   if (JSON.stringify((await store.read()).vault) !== JSON.stringify(previous.vault)) throw new StorageError('Verification readback mismatch; do not resend.');
   console.log(JSON.stringify({ verifiedUpdate: true, ...store.journal() }, null, 2));
  } else if (mode === 'migrate') {
   const previous = await store.read();
   if (previous.entityKey) throw Error('Arkiv state already exists. Migration will not overwrite it.');
   const vault = readSqliteVault(join(setting('VAULT_DATA_DIR') || join(process.cwd(), 'data'), 'vault.sqlite'));
   validateVault(vault);
   await store.write(vault, previous);
   const actual = (await store.read()).vault;
   if (JSON.stringify(actual) !== JSON.stringify(vault)) throw Error('Migration readback mismatch. Do not repeat migration.');
   console.log(JSON.stringify({ migrated: true, wallets: actual.wallets.length, groups: actual.groups.length, transactions: actual.transactions.length, ...store.journal() }, null, 2));
  } else throw Error('Usage: tijori-server arkiv check | migrate | verify-write');
 });
} catch (e) { console.error(e instanceof StorageError ? e.message : 'Arkiv operation failed. Check configuration and journal locally; do not resend an uncertain write.'); process.exitCode = 1; }
