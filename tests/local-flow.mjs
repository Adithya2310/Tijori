import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'tijori-local-flow-'));
const port = 3186, base = `http://127.0.0.1:${port}/api/`;
const env = { ...process.env, TIJORI_STORAGE_MODE: 'local', LOCAL_DEMO_DATA_DIR: directory, ARKIV_ACCESS_KEY: '', ARKIV_WALLET_PRIVATE_KEY: 'invalid-local-test', ARKIV_MAX_TOTAL_FEE_TGLM: '0' };
let server;
async function request(path, body, operation) {
 const response = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(operation ? {'Idempotency-Key': operation} : {}) }, body: JSON.stringify(body) } : {});
 return { status: response.status, data: await response.json() };
}
async function start() {
 server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: 'ignore' });
 for (let i = 0; i < 100; i++) {
  try { if ((await request('state')).status === 200) return; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw Error('Local test server did not start.');
}
async function stop() { if (server && server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; } }
try {
 await start();
 const modelPath = 'tijori-assets/models/Xenova/dinov2-small/c2bb04a51fab207c420665f1946016107bffc701/onnx/model.onnx';
 const assetBase = `http://127.0.0.1:${port}/`;
 const modelHead = await fetch(assetBase + modelPath, { method: 'HEAD' });
 assert.equal(modelHead.status, 200);
 assert.equal(Number(modelHead.headers.get('content-length')), 88_459_888);
 assert.match(modelHead.headers.get('cache-control'), /immutable/);
 const range = await fetch(assetBase + modelPath, { headers: { Range: 'bytes=0-15' } });
 assert.equal(range.status, 206);
 assert.equal((await range.arrayBuffer()).byteLength, 16);
 const runtime = await fetch(assetBase + 'tijori-assets/runtime/1.31.0-dev.20260914-8d85527a0/ort-wasm-simd-threaded.wasm', { method: 'HEAD' });
 assert.equal(runtime.status, 200);
 assert.match(runtime.headers.get('content-type'), /application\/wasm/);
 assert.equal((await request('state')).data.storageMode, 'local');
 const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
 const profileBytes=Buffer.alloc(33*384);for(let i=0;i<33;i++)profileBytes[i*384]=127;
 const objectProfile={version:1,encoding:'sam-q8-grid32',model:'Xenova/dinov2-small',revision:'c2bb04a51fab207c420665f1946016107bffc701',data:profileBytes.toString('base64')};
 const bodies = [1, 2].map(n => ({ name: `Local device ${n}`, address: '0x' + String(n).repeat(40), keyEnvelope, objectProfile, objectName: 'dino-object-demo-v1' }));
 const results = await Promise.all(bodies.map((body, i) => request(i===1?'v1/identities':'signup', body, `local-signup-${i}`)));
 assert.ok(results.every(result => result.status === 200));
 const [laptop, phone] = results.map(result => result.data.identityId);
 assert.equal((await request('signup', bodies[0], 'local-signup-0')).data.identityId, laptop);
 const state = (await request('state')).data;
 assert.equal(state.peers.length, 2);
 const storedObjects=await request('v1/object-identities');assert.equal(storedObjects.status,200);assert.equal(storedObjects.data.identities.length,2);assert.equal(storedObjects.data.identities[0].objectProfile.data,objectProfile.data);
 assert.ok(!JSON.stringify(state).includes('ciphertext'));
 assert.equal((await request('v1/identities/login', { address: bodies[1].address, objectName: bodies[1].objectName })).data.identityId, phone);
 const groupResult = await request('groups', { name: 'Local acoustic fixture', creatorId: laptop, addresses: [bodies[1].address] });
 assert.equal(groupResult.status, 200);
 const group = groupResult.data.groups[0];
 assert.equal(group.members.length, 2);
 const scoped=await request('v1/state?identityId='+phone);assert.equal(scoped.data.storageMode,'local');assert.equal(scoped.data.peers.length,2);assert.equal(scoped.data.groups[0].requiredApprovals,2);
 assert.ok((await request('state')).data.groups[0].members.some(m => m.id === phone));
 const post = (action, extra = {}, id) => request('proximity', { action, groupId: group.id, walletId: laptop, ...extra }, id);
 const started = await post('start', {}, 'local-start');
 assert.equal(started.status, 200);
 const sessionId = started.data.session.id, nonce = started.data.nonce;
 assert.equal((await post('start', {}, 'local-start')).data.nonce, nonce);
 const statusPath = `proximity?groupId=${group.id}&walletId=${phone}`;
 assert.ok(!JSON.stringify((await request(statusPath)).data).includes(nonce));
 assert.equal((await post('verify', { walletId: phone, sessionId, nonce: 'WRONG1' })).status, 400);
 const matches = await Promise.all([1, 2].map(() => post('verify', { walletId: phone, sessionId, nonce })));
 assert.ok(matches.every(result => result.status === 200));
 assert.equal(matches[1].data.session.matches.length, 1);
 const before = await readFile(join(directory, 'state.json'), 'utf8');
 await request(statusPath); await request('state');
 assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before);
 assert.ok(!before.includes(nonce));
 await stop(); await start();
 assert.equal((await request('state')).data.wallets.length, 2);
 assert.equal((await request(statusPath)).data.session.matches[0].walletId, phone);
 assert.equal((await post('cancel', { sessionId })).status, 200);
 assert.equal((await post('verify', { walletId: phone, sessionId, nonce })).status, 400);
 assert.equal((await request('register-safe', {})).status, 400);
 assert.deepEqual((await readdir(directory)).sort(), ['encryption.key', 'state.json']);
 console.log('Passed local two-device API flow: parallel signup, peer discovery, group membership, acoustic challenge/match, idempotency, read-only polling and restart persistence without Arkiv credentials.');
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
