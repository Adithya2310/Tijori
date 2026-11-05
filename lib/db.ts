import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.VAULT_DATA_DIR || join(process.cwd(), 'data');
mkdirSync(root, { recursive: true });
const db = new DatabaseSync(join(root, 'vault.sqlite'));
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, name TEXT NOT NULL, object_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, frequency INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS members (group_id TEXT NOT NULL REFERENCES groups(id), wallet_id TEXT NOT NULL REFERENCES wallets(id), PRIMARY KEY(group_id,wallet_id));
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), sender_id TEXT NOT NULL REFERENCES wallets(id), recipient TEXT NOT NULL, amount REAL NOT NULL, asset TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS approvals (transaction_id TEXT NOT NULL REFERENCES transactions(id), wallet_id TEXT NOT NULL REFERENCES wallets(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(transaction_id,wallet_id));`);
export default db;
