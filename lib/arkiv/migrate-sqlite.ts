import { DatabaseSync } from 'node:sqlite';
import { emptyVault, validateVault, type Wallet, type Group, type Transaction } from '../vault.ts';

// Read-only import. Validation and Arkiv writes happen before reporting migration success.
export function readSqliteVault(path: string) {
 const db = new DatabaseSync(path, { readOnly: true });
   const vault = emptyVault();
   try {
    const columns = db.prepare('PRAGMA table_info(wallets)').all() as { name: string }[];
    const world = columns.some(c => c.name === 'world_id') ? 'world_id' : "'legacy-' || id AS world_id";
    const legacy = db.prepare(`SELECT id,name,object_name,${world},created_at FROM wallets ORDER BY created_at,rowid`).all() as unknown as (Omit<Wallet, 'address'> & { world_id: string })[];
    vault.wallets = validateVault({ ...vault, version: 2, wallets: legacy.map(w => ({ ...w, world_id: w.world_id.toLowerCase() })) }).wallets;
    vault.groups = (db.prepare('SELECT id,name,frequency,created_at FROM groups ORDER BY created_at,rowid').all() as unknown as Omit<Group, 'memberIds'>[]).map(g => ({ ...g, frequency: String(g.frequency), memberIds: (db.prepare('SELECT wallet_id FROM members WHERE group_id=? ORDER BY rowid').all(g.id) as { wallet_id: string }[]).map(m => m.wallet_id) }));
    vault.transactions = (db.prepare('SELECT * FROM transactions ORDER BY created_at,rowid').all() as Omit<Transaction, 'approvalIds'>[]).map(t => ({ ...t, approvalIds: (db.prepare('SELECT wallet_id FROM approvals WHERE transaction_id=? ORDER BY rowid').all(t.id) as { wallet_id: string }[]).map(a => a.wallet_id) }));
    // Proximity-branch SQLite databases may also contain session history. Preserve it explicitly.
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(t => t.name));
    if (tables.has('proximity_sessions') !== tables.has('proximity_matches')) throw Error('Incomplete proximity schema.');
    if (tables.has('proximity_sessions')) {
     const sessions = db.prepare('SELECT * FROM proximity_sessions ORDER BY created_at,rowid').all() as {id:string;group_id:string;host_id:string;nonce:string;created_at:number;expires_at:number;cancelled:number}[];
     if (sessions.some(s => s.cancelled !== 0 && s.cancelled !== 1)) throw Error('Invalid SQLite cancellation state.');
     vault.proximitySessions = sessions.map(s => ({id:s.id,groupId:s.group_id,hostId:s.host_id,nonce:s.nonce,createdAt:s.created_at,expiresAt:s.expires_at,cancelled:!!s.cancelled,operationId:`sqlite-${s.id}`,matches:db.prepare('SELECT wallet_id AS walletId,verified_at AS verifiedAt,attestation_hash AS attestationHash FROM proximity_matches WHERE session_id=? ORDER BY verified_at,rowid').all(s.id) as {walletId:string;verifiedAt:number;attestationHash:string}[]}));
     const matchCount = db.prepare('SELECT COUNT(*) AS n FROM proximity_matches').get() as {n:number};
     if (matchCount.n !== vault.proximitySessions.reduce((n,s) => n+s.matches.length,0)) throw Error('Orphaned proximity matches.');
    }
   } finally { db.close(); }
 return validateVault(vault);
}
