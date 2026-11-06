import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSqliteVault } from '@tijori/server/storage/migrate-sqlite';

test('read-only SQLite import preserves existing identities, relationships and acoustic history', () => {
 const dir=mkdtempSync(join(tmpdir(),'tichori-migrate-')),path=join(dir,'vault.sqlite');
 try {
  const db=new DatabaseSync(path);
  db.exec(`CREATE TABLE wallets(id TEXT,name TEXT,object_name TEXT,world_id TEXT,created_at TEXT);
   CREATE TABLE groups(id TEXT,name TEXT,frequency TEXT,created_at TEXT);
   CREATE TABLE members(group_id TEXT,wallet_id TEXT);
   CREATE TABLE transactions(id TEXT,group_id TEXT,sender_id TEXT,recipient TEXT,amount REAL,asset TEXT,note TEXT,status TEXT,created_at TEXT);
   CREATE TABLE approvals(transaction_id TEXT,wallet_id TEXT);
   INSERT INTO wallets VALUES('alice','Alice','mug','old-alice','now'),('bob','Bob','book','old-bob','now');
   INSERT INTO groups VALUES('group','Family','private-code','now');
   INSERT INTO members VALUES('group','alice'),('group','bob');
   INSERT INTO transactions VALUES('tx','group','alice','demo',1,'ETH','','pending','now');
   INSERT INTO approvals VALUES('tx','alice');`);
  const before=readSqliteVault(path);
  assert.equal(before.version,6);assert.deepEqual(before.proximitySessions,[]);
  db.exec(`CREATE TABLE proximity_sessions(id TEXT,group_id TEXT,host_id TEXT,nonce TEXT,created_at INTEGER,expires_at INTEGER,cancelled INTEGER);
   CREATE TABLE proximity_matches(session_id TEXT,wallet_id TEXT,verified_at INTEGER,attestation_hash TEXT);
   INSERT INTO proximity_sessions VALUES('session','group','alice','ABC123',1000,121000,1);`);
  db.prepare('INSERT INTO proximity_matches VALUES(?,?,?,?)').run('session','bob',2000,'a'.repeat(64));
  const imported=readSqliteVault(path);
  assert.deepEqual({...imported,proximitySessions:[]},before);
  assert.equal(imported.wallets[0].legacy_id,'old-alice');
  assert.deepEqual(JSON.parse(JSON.stringify(imported.proximitySessions[0])),{id:'session',groupId:'group',hostId:'alice',nonce:'ABC123',createdAt:1000,expiresAt:121000,cancelled:true,operationId:'sqlite-session',matches:[{walletId:'bob',verifiedAt:2000,attestationHash:'a'.repeat(64)}]});
  assert.equal(db.prepare('SELECT nonce FROM proximity_sessions').get()?.nonce,'ABC123','source stays untouched');
  db.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
