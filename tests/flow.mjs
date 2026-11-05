import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'privacy-vault-test-'));
const port = 3178;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], { env: { ...process.env, VAULT_DATA_DIR: dir }, stdio: 'ignore' });
const base = `http://localhost:${port}/api/`;
async function request(path, body) {
 const response = await fetch(base + path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {});
 return { status: response.status, data: await response.json() };
}
try {
 let ready = false;
 for (let i=0;i<100;i++) { try { if ((await request('state')).status === 200) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
 assert.ok(ready, 'server started');
 let state;
 for (let i=0;i<5;i++) state=(await request('wallets',{name:`Person ${i}`,objectName:`Object ${i}`})).data;
 const ids=state.wallets.map(w=>w.id);
 assert.equal((await request('groups',{name:'Bad',memberIds:[ids[0]]})).status,400);
 state=(await request('groups',{name:'Family',memberIds:ids})).data;
 const group=state.groups[0];
 state=(await request('transactions',{groupId:group.id,senderId:ids[0],recipient:'demo-recipient',amount:1,asset:'ETH'})).data;
 const tx=state.transactions[0];
 assert.equal(tx.approvals.length,1);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:ids[0]})).status,400);
 state=(await request('approve',{transactionId:tx.id,walletId:ids[1]})).data;
 assert.equal(state.transactions[0].status,'pending');
 state=(await request('approve',{transactionId:tx.id,walletId:ids[2]})).data;
 assert.equal(state.transactions[0].status,'completed');
 assert.equal(state.transactions[0].approvals.length,3);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:ids[3]})).status,400);
 assert.equal((await request('state')).data.transactions[0].status,'completed');
 console.log('Passed: persistence, validation, unique approvals and 3-of-5 majority.');
} finally {
 if (server.exitCode === null) {
  server.kill('SIGTERM');
  await new Promise(resolve=>server.once('exit',resolve));
 }
 await rm(dir,{recursive:true,force:true});
}
