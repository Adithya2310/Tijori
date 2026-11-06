import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rpcFixture } from './rpc-fixture.mjs';
import { privateKeyToAccount } from 'viem/accounts';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const addr = n => '0x' + n.toString(16).padStart(40, '0');
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
const dir = await mkdtemp(join(tmpdir(), 'privacy-vault-test-'));
const port = 3178;
const rpc = await rpcFixture();
const privateKey = '0x' + '11'.repeat(32);
const env = { ...process.env, TICHORI_STORAGE_MODE: 'arkiv', VAULT_DATA_DIR: dir, ARKIV_ACCESS_KEY: 'fixture', ARKIV_WALLET_PRIVATE_KEY: privateKey, ARKIV_WALLET_ADDRESS: privateKeyToAccount(privateKey).address, ARKIV_STATE_ENCRYPTION_KEY: '22'.repeat(32), ARKIV_NAMESPACE: 'fixture', ARKIV_MAX_TOTAL_FEE_TGLM: '0.1', NODE_OPTIONS: `--import=${pathToFileURL(resolve('tests/rpc-preload.mjs')).href}`, TICHORI_FIXTURE_URL: rpc.url };
let server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env, stdio: 'ignore' });
const base = `http://localhost:${port}/api/`;
async function request(path, body, headers = {}) {
 const response = await fetch(base + path, body ? {method:'POST', headers:{'Content-Type':'application/json',...headers}, body:JSON.stringify(body)} : {});
 return { status: response.status, data: await response.json() };
}
try {
 let ready = false;
 for (let i=0;i<100;i++) { try { if ((await request('state')).status === 200) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
 assert.ok(ready, 'server started');
 const network=(await request('network-info')).data;assert.equal(network.enabled,false);assert.deepEqual(network.urls,[]);
 let result=await request('signup',{name:'Person 0',address:addr(1),keyEnvelope,objectName:'Object 0'});
 assert.equal(result.status,200); const creator=result.data.identityId;
 assert.equal((await request('login',{address:addr(1),keyEnvelope,objectName:'wrong'})).status,400);
 assert.equal((await request('login',{address:addr(1),keyEnvelope,objectName:'Object 0'})).data.identityId,creator);
 const loopbackLogin=await fetch(`http://127.0.0.1:${port}/api/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`},body:JSON.stringify({address:addr(1),keyEnvelope,objectName:'Object 0'})});
 assert.equal(loopbackLogin.status,200,'browser same-origin loopback login');
 assert.equal((await loopbackLogin.json()).identityId,creator);
 assert.equal((await request('signup',{name:'Duplicate',address:addr(1),keyEnvelope,objectName:'Object'})).status,400);
 assert.equal((await request('groups',{name:'Bad',creatorId:creator,addresses:[]})).status,400);
 const beforeInvalidSafe=rpc.control.sends;
 assert.equal((await request('register-safe',{name:'Bad Safe',creatorId:creator,owners:['invalid'],saltNonce:'1',address:'invalid',deploymentTxHash:'invalid'})).status,400);
 assert.equal(rpc.control.sends,beforeInvalidSafe); // Invalid Safe data must never trigger an Arkiv write.
 result=await request('groups',{name:'Family',creatorId:creator,addresses:[addr(2),addr(3),addr(4),addr(5)]});
 let state=result.data; const group=state.groups[0];
 assert.equal(group.members.length,5); assert.ok(!('frequency' in group));
 const invited=group.members.find(w=>w.address===addr(2)).id;
 result=await request('signup',{name:'Person 1',address:addr(2),keyEnvelope,objectName:'Object 1'});
 assert.equal(result.data.identityId,invited); // Claim the invitation, don't duplicate membership.
 for (let i=2;i<5;i++) await request('signup',{name:`Person ${i}`,address:addr(i+1),keyEnvelope,objectName:`Object ${i}`});
 state=(await request('state')).data; const ids=state.groups[0].members.map(w=>w.id);
 assert.equal(ids.length,5);
 await request('groups',{name:'Second',creatorId:creator,addresses:[addr(2)]});
 assert.equal(rpc.control.sends,7); // Login and rejected requests do not spend gas.
 assert.ok(rpc.entity().attributes.some(a=>a.name==='ciphertext'));
 assert.ok(!JSON.stringify(rpc.entity()).includes('Object 0'));
 state=(await request('transactions',{groupId:group.id,senderId:creator,recipient:'demo-recipient',amount:1,asset:'ETH'})).data;
 const tx=state.transactions[0]; assert.ok(!('frequency' in tx)); assert.equal(tx.approvals.length,1);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:creator})).status,400);
 state=(await request('approve',{transactionId:tx.id,walletId:ids[1]})).data; assert.equal(state.transactions[0].status,'pending');
 state=(await request('approve',{transactionId:tx.id,walletId:ids[2]})).data; assert.equal(state.transactions[0].status,'completed');
 assert.equal(state.transactions[0].approvals.length,3);
 assert.equal((await request('approve',{transactionId:tx.id,walletId:ids[3]})).status,400);
 assert.equal((await request('state')).data.transactions[0].status,'completed');
 // Proximity uses the same encrypted Arkiv aggregate and never creates a transfer.
 const post=(action,extra={},headers={})=>request('proximity',{groupId:group.id,walletId:creator,action,...extra},headers);
 const txBefore=JSON.stringify((await request('state')).data.transactions);
 const startHeaders={'Idempotency-Key':'acoustic-start'};
 const beforeCheck=rpc.control.sends;
 let check=await post('start',{},startHeaders);assert.equal(check.status,200);
 const session=check.data.session,nonce=check.data.nonce;
 assert.match(nonce,/^[A-Z0-9]{6}$/);assert.equal(session.expiresAt-session.createdAt,120000);
 assert.equal(rpc.control.sends,beforeCheck+1);
 assert.equal((await post('start',{},startHeaders)).data.nonce,nonce);
 assert.equal(rpc.control.sends,beforeCheck+1,'start retry must not spend another fee');
 assert.equal((await post('start')).status,400);
 const status=await request(`proximity?groupId=${group.id}&walletId=${ids[1]}`);
 assert.equal(status.status,200);assert.ok(!JSON.stringify(status.data).includes(nonce));
 assert.ok(!JSON.stringify((await request('state')).data).includes(nonce));
 assert.ok(!JSON.stringify(rpc.entity()).includes(nonce),'challenge stays encrypted on Arkiv');
 assert.equal((await post('verify',{sessionId:session.id,nonce})).status,400);
 assert.equal((await post('verify',{walletId:ids[1],sessionId:session.id,nonce:'WRONG1'})).status,400);
 assert.equal((await post('verify',{walletId:ids[1],sessionId:'wrong',nonce})).status,400);
 assert.equal((await post('cancel',{walletId:ids[1],sessionId:session.id})).status,400);
 const beforeMatches=rpc.control.sends;
 const parallelMatches=await Promise.all([ids[1],ids[2]].map(walletId=>post('verify',{walletId,sessionId:session.id,nonce})));
 assert.ok(parallelMatches.every(r=>r.status===200));
 const matches=(await request(`proximity?groupId=${group.id}&walletId=${creator}`)).data.session.matches;
 assert.equal(matches.length,2);assert.equal(rpc.control.sends,beforeMatches+2);
 const hash=matches.find(m=>m.walletId===ids[1]).attestationHash;
 assert.equal((await post('verify',{walletId:ids[1],sessionId:session.id,nonce})).data.session.matches.find(m=>m.walletId===ids[1]).attestationHash,hash);
 assert.equal(rpc.control.sends,beforeMatches+2,'duplicate match and polling must not spend');
 const second=(await request('state')).data.groups.find(g=>g.id!==group.id);
 assert.equal((await post('verify',{groupId:second.id,walletId:ids[1],sessionId:session.id,nonce})).status,400);
 assert.equal((await post('verify',{walletId:'outsider',sessionId:session.id,nonce})).status,400);
 assert.equal((await post('cancel',{sessionId:session.id},{Origin:'https://other.example'})).status,400);
 assert.equal((await request('proximity',[])).status,400);
 assert.equal((await request('proximity',{action:'start',groupId:group.id,walletId:creator,extra:'x'.repeat(2050)})).status,400);
 rpc.control.failQuery=true;assert.equal((await request(`proximity?groupId=${group.id}&walletId=${creator}`)).status,503);rpc.control.failQuery=false;
 const snapshot=(await request(`proximity?groupId=${group.id}&walletId=${creator}`)).data;
 server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env,stdio:'ignore'});
 let resumed=false;for(let i=0;i<100;i++){try{const r=await request(`proximity?groupId=${group.id}&walletId=${creator}`);if(r.status===200){assert.deepEqual(r.data,snapshot);resumed=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(resumed,'active acoustic session and matches survive restart');
 assert.equal((await post('cancel',{sessionId:session.id})).data.session.status,'cancelled');
 const beforeCancelRetry=rpc.control.sends;assert.equal((await post('cancel',{sessionId:session.id})).status,200);assert.equal(rpc.control.sends,beforeCancelRetry);
 assert.equal((await post('verify',{walletId:ids[3],sessionId:session.id,nonce})).status,400);
 const racing=await Promise.all([post('start'),post('start')]);assert.deepEqual(racing.map(r=>r.status).sort(),[200,400]);
 const winner=racing.find(r=>r.status===200).data;
 assert.notEqual(winner.nonce,nonce);
 assert.equal((await post('verify',{walletId:ids[1],sessionId:session.id,nonce})).status,400);
 assert.equal((await post('cancel',{sessionId:winner.session.id})).status,200);
 // Reconcile an uncertain start before replaying its stable operation ID; never resend.
 rpc.control.loseSendResponse=true;rpc.control.hideReceipt=true;
 const lostHeaders={'Idempotency-Key':'lost-acoustic-start'};
 const beforeLost=rpc.control.sends;assert.equal((await post('start',{},lostHeaders)).status,503);
 assert.equal((await request(`proximity?groupId=${group.id}&walletId=${creator}`)).status,503);
 rpc.control.hideReceipt=false;const recovered=await post('start',{},lostHeaders);
 assert.equal(recovered.status,200);assert.ok(recovered.data.nonce);assert.equal(rpc.control.sends,beforeLost+1);
 assert.equal((await post('cancel',{sessionId:recovered.data.session.id})).status,200);
 rpc.control.failEstimate=true;const beforeFailed=rpc.control.sends;
 assert.equal((await post('start')).status,503);assert.equal(rpc.control.sends,beforeFailed);rpc.control.failEstimate=false;
 assert.equal((await request(`proximity?groupId=${group.id}&walletId=${creator}`)).data.session.status,'cancelled','failed write leaves the previous check intact');
 assert.equal(JSON.stringify((await request('state')).data.transactions),txBefore,'acoustic checks never alter transfers or approvals');
 console.log('Passed Arkiv acoustic flow: encrypted challenges, read-only polling, concurrent starts/matches, idempotency, cancellation, isolation, restart and uncertain-write recovery.');
 // Lost send response must reconcile the original signed transaction, without another send.
 const before=rpc.control.sends; rpc.control.loseSendResponse=true; rpc.control.hideReceipt=true;
 assert.equal((await request('groups',{name:'Recovered',creatorId:creator,addresses:[addr(2)]})).status,503);
 assert.equal((await request('state')).status,503);
 assert.equal(rpc.control.sends,before+1); rpc.control.hideReceipt=false;
 assert.equal((await request('state')).data.groups[0].name,'Recovered');
 assert.equal(rpc.control.sends,before+1);
 rpc.control.failQuery=true; assert.equal((await request('state')).status,503); rpc.control.failQuery=false;
 rpc.control.failEstimate=true; const sends=rpc.control.sends;
 assert.equal((await request('groups',{name:'No broadcast',creatorId:creator,addresses:[addr(2)]})).status,503);
 assert.equal(rpc.control.sends,sends); rpc.control.failEstimate=false;
 rpc.control.duplicate=true; assert.equal((await request('state')).status,503); rpc.control.duplicate=false;
 rpc.control.erase=true; assert.equal((await request('state')).status,503); rpc.control.erase=false;
 rpc.control.reset=true; assert.equal((await request('state')).status,503); rpc.control.reset=false;
 rpc.control.gasPrice=10n**18n;
 assert.equal((await request('groups',{name:'Over budget',creatorId:creator,addresses:[addr(2)]})).status,503);
 assert.equal(rpc.control.sends,sends); rpc.control.gasPrice=1n;
 const operationId='repeat-safely'; const beforeReplay=rpc.control.sends;
 const input={name:'Idempotent',creatorId:creator,addresses:[addr(2)]};
 assert.equal((await request('groups',input,{'Idempotency-Key':operationId})).status,200);
 assert.equal((await request('groups',input,{'Idempotency-Key':operationId})).status,200);
 assert.equal(rpc.control.sends,beforeReplay+1);
 assert.equal((await request('groups',{...input,name:'Changed'},{'Idempotency-Key':operationId})).status,400);
 assert.equal((await request('groups',input,{'Origin':'https://other.example'})).status,400);
 const parallel=await Promise.all([request('groups',{...input,name:'Concurrent A'}),request('groups',{...input,name:'Concurrent B'})]);
 assert.ok(parallel.every(r=>r.status===200));
 const final=(await request('state')).data; assert.ok(final.groups.some(g=>g.name==='Concurrent A')); assert.ok(final.groups.some(g=>g.name==='Concurrent B'));
 server.kill('SIGTERM'); await new Promise(resolve=>server.once('exit',resolve));
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env,stdio:'ignore'});
 let restarted=false; for(let i=0;i<100;i++){try{const r=await request('state');if(r.status===200){assert.deepEqual(r.data,final);restarted=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
 assert.ok(restarted,'state persists across server restart');
 console.log('Passed API + SDK fixture: enrollment, invitations, majority, encrypted writes, receipt recovery, missing/duplicate state, upstream failure and fee guards.');
} finally {
 if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve=>server.once('exit',resolve)); }
 await rpc.close();
 await rm(dir,{recursive:true,force:true});
}
