import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = await mkdtemp(join(tmpdir(), 'privacy-vault-test-'));
const port = 3178;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env: { ...process.env, VAULT_DATA_DIR: dir }, stdio: 'ignore' });
const base = `http://localhost:${port}/api/`;
async function request(path, body) {
 const response = await fetch(base + path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {});
 return { status: response.status, data: await response.json() };
}
try {
 let ready = false;
 for (let i=0;i<100;i++) { try { if ((await request('state')).status === 200) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
 assert.ok(ready, 'server started');
 let result=await request('signup',{name:'Person 0',worldId:'person0',objectName:'Object 0'});
 assert.equal(result.status,200); const creator=result.data.identityId;
 assert.equal((await request('login',{worldId:'person0',objectName:'wrong'})).status,400);
 assert.equal((await request('login',{worldId:'PERSON0',objectName:'Object 0'})).data.identityId,creator);
 assert.equal((await request('signup',{name:'Duplicate',worldId:'PERSON0',objectName:'Object'})).status,400);
 assert.equal((await request('groups',{name:'Bad',creatorId:creator,worldIds:[]})).status,400);
 result=await request('groups',{name:'Family',creatorId:creator,worldIds:['person1','person2','person3','person4']});
 let state=result.data; const group=state.groups[0];
 assert.equal(group.members.length,5); assert.ok(!('frequency' in group));
 const invited=group.members.find(w=>w.world_id==='person1').id;
 result=await request('signup',{name:'Person 1',worldId:'person1',objectName:'Object 1'});
 assert.equal(result.data.identityId,invited); // Claim the invitation, don't duplicate membership.
 for (let i=2;i<5;i++) await request('signup',{name:`Person ${i}`,worldId:`person${i}`,objectName:`Object ${i}`});
 state=(await request('state')).data; const ids=state.groups[0].members.map(w=>w.id);
 assert.equal(ids.length,5);
 await request('groups',{name:'Second',creatorId:creator,worldIds:['person1']});
 const sqlite=new DatabaseSync(join(dir,'vault.sqlite'),{readOnly:true});
 const codes=sqlite.prepare('SELECT frequency FROM groups').all().map(row=>row.frequency);sqlite.close();
 assert.equal(new Set(codes).size,2);
 state=(await request('transactions',{groupId:group.id,senderId:creator,recipient:'demo-recipient',amount:1,asset:'ETH'})).data;
 const tx=state.transactions[0]; assert.ok(!('frequency' in tx)); assert.equal(tx.approvals.length,1);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:creator})).status,400);
 state=(await request('approve',{transactionId:tx.id,walletId:ids[1]})).data; assert.equal(state.transactions[0].status,'pending');
 state=(await request('approve',{transactionId:tx.id,walletId:ids[2]})).data; assert.equal(state.transactions[0].status,'completed');
 assert.equal(state.transactions[0].approvals.length,3);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:ids[3]})).status,400);
 assert.equal((await request('state')).data.transactions[0].status,'completed');
 console.log('Passed: enrollment, login, invitations, private unique codes and 3-of-5 majority.');
} finally {
 if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve=>server.once('exit',resolve)); }
 await rm(dir,{recursive:true,force:true});
}
