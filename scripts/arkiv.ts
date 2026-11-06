import nextEnv from '@next/env';
import {isDeepStrictEqual} from 'node:util';
import {objectProfileHash} from '../lib/arkiv/object-codec.ts';
import { readSqliteVault } from '../lib/arkiv/migrate-sqlite.ts';
import { join } from 'node:path';
import { withArkiv, StorageError } from '../lib/arkiv/store.ts';
import { validateVault } from '../lib/vault.ts';
import { reconcileJournal } from '../lib/arkiv/journal-reconcile.ts';
import type { Hex } from 'viem';
nextEnv.loadEnvConfig(process.cwd());
const mode = process.argv[2];
// Entity pointers are storage metadata; compare every logical record and profile unchanged.
const logical=(vault:import('../lib/vault.ts').Vault)=>({...vault,wallets:vault.wallets.map(wallet=>{const copy={...wallet};delete copy.objectProfileRef;return {...copy,...(wallet.objectProfile?{objectProfile:objectProfileHash(wallet.objectProfile)}:{})};})});
try {
 if(mode==='reconcile'){
  const index=process.argv.indexOf('--tx');
  const hashes=index<0?[]:(process.argv[index+1]??'').split(',') as Hex[];
  console.log(JSON.stringify(await reconcileJournal(hashes,process.argv.includes('--apply')),null,2));
 }else await withArkiv(async store => {
  if (mode === 'check') {
   const balance = await store.reader.getBalance({ address: store.address, blockTag: 'latest' });
   const state = await store.read();
   console.log(JSON.stringify({ chainId: 7794095, address: store.address, balanceWei: balance.toString(), wallets: state.vault.wallets.length, groups: state.vault.groups.length, transactions: state.vault.transactions.length, ...store.journal() }, null, 2));
  } else if (mode === 'verify-write' || mode === 'migrate-objects') {
   const previous = await store.read();
   if (!previous.entityKey) throw new StorageError('Migrate or create the vault before verifying updates.');
   if(mode==='migrate-objects'&&!previous.vault.wallets.some(w=>w.objectProfile&&!w.objectProfileRef)){console.log(JSON.stringify({alreadyMigrated:true,...store.journal()},null,2));return;}
   await store.write(previous.vault, previous);
   if (!isDeepStrictEqual(logical((await store.read()).vault),logical(previous.vault))) throw new StorageError('Verification readback mismatch; do not resend.');
   console.log(JSON.stringify({ verifiedUpdate: true, ...store.journal() }, null, 2));
  } else if (mode === 'migrate') {
   const previous = await store.read();
   if (previous.entityKey) throw Error('Arkiv state already exists. Migration will not overwrite it.');
   const vault = readSqliteVault(join(process.env.VAULT_DATA_DIR || join(process.cwd(), 'data'), 'vault.sqlite'));
   validateVault(vault);
   await store.write(vault, previous);
   const actual = (await store.read()).vault;
   if (!isDeepStrictEqual(logical(actual),logical(vault))) throw Error('Migration readback mismatch. Do not repeat migration.');
   console.log(JSON.stringify({ migrated: true, wallets: actual.wallets.length, groups: actual.groups.length, transactions: actual.transactions.length, ...store.journal() }, null, 2));
  } else throw Error('Use check, migrate, verify-write or reconcile --tx <ordered hashes> [--apply].');
 });
} catch (e) { console.error(e instanceof StorageError ? e.message : 'Arkiv operation failed. Check configuration and journal locally; do not resend an uncertain write.'); process.exitCode = 1; }
