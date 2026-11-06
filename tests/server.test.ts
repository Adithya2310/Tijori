import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTijoriServer, fromEnv, memoryStorage, routeOf, StorageError, type StorageAdapter, type TijoriEvent } from '@tijori/server';
import { toNodeHandler } from '@tijori/server/node';
import { runInContext, setting } from '@tijori/server/context';

const ORIGIN = 'http://tijori.test';
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
const address = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(ORIGIN + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (path: string) => new Request(ORIGIN + path);
const signup = (n: number) => ({ name: `Member ${n}`, address: address(n), keyEnvelope, objectName: 'mug' });

test('routes v1 and legacy paths after the base path; outside paths are 404', async () => {
 assert.deepEqual(routeOf(new URL('http://x/api/v1/state'), '/api'), { versioned: true, path: 'state' });
 assert.deepEqual(routeOf(new URL('http://x/api/tijori/vaults/register-safe'), '/api/tijori/'), { versioned: false, path: 'vaults/register-safe' });
 assert.equal(routeOf(new URL('http://x/other/state'), '/api'), null);
 const server = createTijoriServer({ storage: memoryStorage(), basePath: '/api' });
 assert.equal((await server.fetch(get('/elsewhere/state'))).status, 404);
 const caps = await server.fetch(get('/api/v1/capabilities'));
 assert.equal(caps.status, 200); assert.equal(caps.headers.get('cache-control'), 'no-store');
 assert.equal((await caps.json()).version, 'v1');
 assert.equal((await server.fetch(new Request(ORIGIN + '/api/v1/state', { method: 'PUT', body: '{}' }))).status, 405);
 const unknown = await server.fetch(get('/api/v1/nope'));
 assert.equal(unknown.status, 400); assert.equal((await unknown.json()).error, 'Unknown action.');
});

test('v1 signup and legacy state share one memory store; each server instance is isolated', async () => {
 const a = createTijoriServer({ storage: memoryStorage() }), b = createTijoriServer({ storage: memoryStorage() });
 const created = await a.fetch(post('/api/v1/identities', signup(1), { 'idempotency-key': 'signup-1' }));
 assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
 const legacy = await (await a.fetch(get('/api/state'))).json();
 assert.equal(legacy.storageMode, 'memory');
 assert.deepEqual(legacy.peers.map((p: { address: string }) => p.address), [address(1)]);
 assert.ok(!JSON.stringify(legacy).includes('object_name'));
 assert.equal((await (await b.fetch(get('/api/state'))).json()).peers.length, 0);
 const retried = await a.fetch(post('/api/v1/identities', signup(1), { 'idempotency-key': 'signup-1' }));
 assert.equal(retried.status, 200, 'idempotent retry returns the stored result');
 assert.equal((await (await a.fetch(get('/api/state'))).json()).peers.length, 1);
});

test('writes refuse cross-origin requests, oversized bodies, sensitive fields and non-JSON', async () => {
 const server = createTijoriServer({ storage: memoryStorage() });
 const cross = await server.fetch(post('/api/v1/identities', signup(1), { origin: 'https://evil.example', host: 'tijori.test' }));
 assert.equal(cross.status, 400); assert.match((await cross.json()).error, /Cross-origin/);
 const same = await server.fetch(post('/api/v1/identities', signup(2), { origin: ORIGIN, host: 'tijori.test' }));
 assert.equal(same.status, 200);
 const big = await server.fetch(post('/api/groups', { name: 'x'.repeat(17000) }));
 assert.match((await big.json()).error, /too large/);
 const secret = await server.fetch(post('/api/v1/identities', { ...signup(3), nested: { privateKey: '0x01' } }));
 assert.match((await secret.json()).error, /Do not send/);
 const notJson = await server.fetch(post('/api/v1/identities', 'nope'));
 assert.equal(notJson.status, 400);
 const proximity = await server.fetch(post('/api/v1/proximity', { action: 'start', pad: 'x'.repeat(3000) }));
 assert.match((await proximity.json()).error, /too large/);
 assert.equal((await (await server.fetch(get('/api/state'))).json()).peers.length, 1);
});

test('error mapping: storage failures are 503, unknown invoices 404, proximity membership 400', async () => {
 const broken: StorageAdapter = { mode: 'broken', transact: async () => { throw new StorageError('Storage is offline.'); } };
 const down = await createTijoriServer({ storage: broken }).fetch(get('/api/v1/state'));
 assert.equal(down.status, 503); assert.equal((await down.json()).error, 'Storage is offline.');
 const server = createTijoriServer({ storage: memoryStorage() });
 assert.equal((await server.fetch(get('/api/v1/invoices/receipt?id=0f8fad5b-d9cb-469f-a165-70867728950e'))).status, 404);
 assert.equal(await server.invoiceReceipt('0f8fad5b-d9cb-469f-a165-70867728950e'), null);
 for (const path of ['/api/proximity?groupId=g&walletId=w', '/api/v1/proximity?groupId=g&walletId=w']) assert.equal((await server.fetch(get(path))).status, 400, path);
});

test('custom providers and settings are scoped to their server instance', async () => {
 const server = createTijoriServer({ storage: memoryStorage(), env: { TICHORI_EXAMPLE: 'legacy' }, providers: { externalVault: { id: 'custom-vault', configured: true, async verifyApproval() { return { accepted: true, mode: 'live', provider: 'custom-vault' }; } } } });
 const caps = await (await server.fetch(get('/api/v1/capabilities'))).json();
 assert.deepEqual(caps.externalVault, { provider: 'custom-vault', configured: true });
 assert.equal(await server.run(async () => setting('TIJORI_EXAMPLE')), 'legacy', 'TIJORI_* falls back to TICHORI_*');
 const other = await (await createTijoriServer({ storage: memoryStorage() }).fetch(get('/api/v1/capabilities'))).json();
 assert.notEqual(other.externalVault.provider, 'custom-vault');
});

test('fromEnv prefers TIJORI_* names and aliases legacy TICHORI_* names', () => {
 const { env } = fromEnv({ TICHORI_STORAGE_MODE: 'local', TICHORI_API_MASTER_KEY: 'old', TIJORI_API_MASTER_KEY: 'new' });
 assert.equal(env!.TIJORI_STORAGE_MODE, 'local');
 assert.equal(env!.TIJORI_API_MASTER_KEY, 'new');
 assert.equal(runInContext({ settings: { TIJORI_STORAGE_MODE: 'memory' }, storage: () => memoryStorage(), providers: () => { throw new Error('unused'); }, waitUntil: () => {}, emit: () => {} }, () => setting('TIJORI_STORAGE_MODE')), 'memory');
});

test('Node adapter serves the same handler and drain waits for background events', async () => {
 const events: TijoriEvent[] = [];
 const server = createTijoriServer({ storage: memoryStorage(), basePath: '/tijori', onEvent: async event => { events.push(event); } });
 const http = createServer(toNodeHandler(server));
 await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
 try {
  const { port } = http.address() as { port: number };
  const created = await fetch(`http://127.0.0.1:${port}/tijori/v1/identities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signup(4)) });
  assert.equal(created.status, 200);
  const state = await (await fetch(`http://127.0.0.1:${port}/tijori/state`)).json();
  assert.equal(state.peers[0].address, address(4));
  const cross = await fetch(`http://127.0.0.1:${port}/tijori/v1/groups`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.match((await cross.json()).error, /Cross-origin/);
  await server.drain();
 } finally { await new Promise(resolve => http.close(resolve)); }
});
