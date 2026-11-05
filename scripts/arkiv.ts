import nextEnv from '@next/env';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { withArkiv, StorageError } from '../lib/arkiv/store.ts';
import { emptyVault, validateVault, type Wallet, type Group, type Transaction } from '../lib/vault.ts';
nextEnv.loadEnvConfig(process.cwd());
const mode = process.argv[2];
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
   const db = new DatabaseSync(join(process.env.VAULT_DATA_DIR || join(process.cwd(), 'data'), 'vault.sqlite'), { readOnly: true });
   const vault = emptyVault();
   try {
    const columns = db.prepare('PRAGMA table_info(wallets)').all() as { name: string }[];
    const world = columns.some(c => c.name === 'world_id') ? 'world_id' : "'legacy-' || id AS world_id";
    vault.wallets = db.prepare(`SELECT id,name,object_name,${world},created_at FROM wallets ORDER BY created_at,rowid`).all() as Wallet[];
    vault.wallets.forEach(w => { w.world_id = w.world_id.toLowerCase(); });
    vault.groups = (db.prepare('SELECT id,name,frequency,created_at FROM groups ORDER BY created_at,rowid').all() as Omit<Group, 'memberIds'>[]).map(g => ({ ...g, frequency: String(g.frequency), memberIds: (db.prepare('SELECT wallet_id FROM members WHERE group_id=? ORDER BY rowid').all(g.id) as { wallet_id: string }[]).map(m => m.wallet_id) }));
    vault.transactions = (db.prepare('SELECT * FROM transactions ORDER BY created_at,rowid').all() as Omit<Transaction, 'approvalIds'>[]).map(t => ({ ...t, approvalIds: (db.prepare('SELECT wallet_id FROM approvals WHERE transaction_id=? ORDER BY rowid').all(t.id) as { wallet_id: string }[]).map(a => a.wallet_id) }));
   } finally { db.close(); }
   validateVault(vault);
   await store.write(vault, previous);
   const actual = (await store.read()).vault;
   if (JSON.stringify(actual) !== JSON.stringify(vault)) throw Error('Migration readback mismatch. Do not repeat migration.');
   console.log(JSON.stringify({ migrated: true, wallets: actual.wallets.length, groups: actual.groups.length, transactions: actual.transactions.length, ...store.journal() }, null, 2));
  } else throw Error('Use check, migrate or verify-write.');
 });
} catch (e) { console.error(e instanceof StorageError ? e.message : 'Arkiv operation failed. Check configuration and journal locally; do not resend an uncertain write.'); process.exitCode = 1; }
