import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { VAULT_RPC, VAULT_USDT, vaultReadPlan, decodeVaultRead, rpcResult } from '../lib/anon-vault-protocol.ts';
import { privateVaultClient } from '../lib/private-vault-client.ts';
import { readPrivateVault } from '../lib/anon-vault.ts';
import { readVaultThroughWorker } from '../lib/anon-vault-reader.ts';

const address = '0x1111111111111111111111111111111111111111';
const owner = '0x2222222222222222222222222222222222222222';
const input = { address, token: VAULT_USDT };
const uint = n => encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(n)]);
const values = ['0x752', '0x6000', '0xde0b6b3a7640000', encodeAbiParameters(parseAbiParameters('address[]'), [[address, owner]]), uint(2), uint(7), uint(12500000), '0x' + '0'.repeat(24) + owner.slice(2)];

test('all destination requests use the worker; wrong chains and undeployed vaults stop further reads', async () => {
 const plan = vaultReadPlan(input), requests = [];
 let chain = '0x752', code = '0x6000', fail = false;
 const workerFetch = async (url, init) => {
  assert.equal(url, VAULT_RPC);
  const request = JSON.parse(init.body); requests.push(request);
  if (fail) throw Error('mixnet unavailable');
  const index = plan.findIndex(r => JSON.stringify(r) === JSON.stringify({ method: request.method, params: request.params }));
  assert.ok(index >= 0);
  return Response.json({ jsonrpc: '2.0', id: 1, result: index === 0 ? chain : index === 1 ? code : values[index] });
 };
 const signal = new AbortController().signal;
 assert.deepEqual(await readVaultThroughWorker(workerFetch, input, signal), values);
 assert.equal(requests.length, 8);
 assert.equal(requests[0].method, 'eth_chainId'); assert.equal(requests[1].method, 'eth_getCode');
 requests.length = 0; chain = '0xa41';
 await assert.rejects(readVaultThroughWorker(workerFetch, input, signal), /Wrong chain/); assert.equal(requests.length, 1);
 requests.length = 0; chain = '0x752'; code = '0x';
 await assert.rejects(readVaultThroughWorker(workerFetch, input, signal), /not deployed/); assert.equal(requests.length, 2);
 requests.length = 0; fail = true;
 await assert.rejects(readVaultThroughWorker(workerFetch, input, signal), /mixnet unavailable/); assert.equal(requests.length, 1);
});

test('fixed vault plan supports only the required public reads; complete Safe result is decoded', () => {
 const plan = vaultReadPlan(input);
 assert.equal(VAULT_RPC, 'https://rpc.testnet.whitechain.io');
 assert.deepEqual(plan.map(r => r.method), ['eth_chainId', 'eth_getCode', 'eth_getBalance', 'eth_call', 'eth_call', 'eth_call', 'eth_call', 'eth_getStorageAt']);
 assert.ok(plan.every(r => !r.params.length || r.params.at(-1) === 'latest'));
 assert.equal(plan[6].params[0].to, VAULT_USDT);
 assert.throws(() => vaultReadPlan({ ...input, address: 'bad' }));
 assert.deepEqual(decodeVaultRead(input, values), { address, chainId: 1874, balanceWei: '1000000000000000000', balanceEth: '1', balanceUsdt: '12.5', owners: [address, owner], threshold: 2, nonce: '7', guard: owner, rehearsalToken: false });
 assert.equal(decodeVaultRead({ ...input, token: owner }, values).rehearsalToken, true);
 assert.equal(decodeVaultRead(input, [...values.slice(0, 7), '0x' + '0'.repeat(64)]).guard, null);
 for (const [index, bad] of [[0, '0xa41'], [1, '0x'], [4, uint(3)], [7, '0x00'], [2, '0x00']]) {
  const changed = [...values]; changed[index] = bad;
  assert.throws(() => decodeVaultRead(input, changed));
 }
 assert.throws(() => decodeVaultRead(input, values.slice(1)));
 for (const response of [null, { jsonrpc: '2.0', id: 2, result: '0x1' }, { jsonrpc: '2.0', id: 1, error: {}, result: '0x1' }, { jsonrpc: '2.0', id: 1, result: '0xz1' }]) assert.throws(() => rpcResult(response, 'quantity'));
});

test('client replaces server balance reads, deduplicates, reports errors, retries and cancels', async () => {
 const state = { groups: [{ id: 'vault', safe: { chainId: 1874, address } }] };
 let direct = 0, calls = 0, finish;
 const base = { state: async () => state, mutate: async () => state, propose: async () => state, createWhitechainVault: async () => state, balance: async () => { direct++; throw Error('Direct read forbidden'); } };
 const adapter = privateVaultClient(base, VAULT_USDT, (_input, signal) => {
  calls++;
  return new Promise((resolve, reject) => { finish = { resolve, reject }; signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }); if (signal.aborted) reject(Error('cancelled')); });
 });
 await adapter.client.state();
 const first = adapter.client.balance('vault');
 assert.equal(adapter.client.balance('vault'), first);
 await Promise.resolve();
 assert.equal(calls, 1); assert.equal(adapter.snapshot('vault').phase, 'loading');
 finish.resolve(decodeVaultRead(input, values));
 assert.equal((await first).balanceUsdt, '12.5');
 assert.equal(adapter.snapshot('vault').phase, 'success');
 const failure = adapter.client.balance('vault'); await Promise.resolve(); finish.reject(Error('Nym unavailable'));
 await assert.rejects(failure, /Nym unavailable/);
 assert.equal(adapter.snapshot('vault').phase, 'error'); assert.ok(adapter.snapshot('vault').updatedAt);
 const retry = adapter.client.balance('vault'); await Promise.resolve(); finish.resolve(decodeVaultRead(input, values)); await retry;
 assert.equal(adapter.snapshot('vault').phase, 'success');
 const cancel = adapter.client.balance('vault'); await Promise.resolve(); adapter.cancelAll();
 await assert.rejects(cancel, /cancelled/); assert.equal(adapter.snapshot('vault').phase, 'idle');
 await assert.rejects(adapter.client.balance('unknown'), /registered Whitechain/);
 assert.equal(direct, 0);
});

test('browser session validates messages and disposes frames on success, invalid data, error, timeout and abort', async () => {
 const original = Object.getOwnPropertyDescriptors(globalThis), events = new EventTarget();
 const origin = 'http://localhost:3000';
 let frames = 0, mode = 'success', sends = 0;
 const document = {
  createElement: () => {
   let appended = false;
   return { hidden: false, title: '', src: '', remove() { if (appended) { frames--; appended = false; } },
    append() { frames++; appended = true; },
    contentWindow: { postMessage(message, target, ports) {
     assert.equal(target, origin); assert.deepEqual(message.input, input); sends++;
     if (mode === 'success') ports[0].postMessage({ kind: 'result', values });
     if (mode === 'invalid') ports[0].postMessage({ kind: 'result', values: [] });
     if (mode === 'error') ports[0].postMessage({ kind: 'error', message: 'Nym unavailable' });
    } },
   };
  },
  body: { appendChild(frame) {
   assert.equal(frame.src, '/anon-rpc/vault-host'); frame.append();
   queueMicrotask(() => {
    const notify = (source, eventOrigin) => { const e = new MessageEvent('message', { origin: eventOrigin, data: { kind: 'vault-host-ready' } }); Object.defineProperty(e, 'source', { value: source }); events.dispatchEvent(e); };
    notify({}, origin); notify(frame.contentWindow, 'https://untrusted.example'); notify(frame.contentWindow, origin);
   });
  } },
 };
 try {
  for (const [key, value] of Object.entries({ document, window: events, location: { origin }, fetch: () => { throw Error('Direct fetch forbidden'); } })) Object.defineProperty(globalThis, key, { configurable: true, value });
  assert.equal((await readPrivateVault(input, new AbortController().signal)).balanceUsdt, '12.5'); assert.equal(frames, 0);
  mode = 'invalid'; await assert.rejects(readPrivateVault(input, new AbortController().signal), /Incomplete/); assert.equal(frames, 0);
  mode = 'error'; await assert.rejects(readPrivateVault(input, new AbortController().signal), /Nym unavailable/); assert.equal(frames, 0);
  mode = 'hang'; await assert.rejects(readPrivateVault(input, new AbortController().signal, 15), /timed out/); assert.equal(frames, 0);
  const controller = new AbortController(), pending = readPrivateVault(input, controller.signal); controller.abort();
  await assert.rejects(pending, /cancelled/); assert.equal(frames, 0);
  await assert.rejects(readPrivateVault(input, controller.signal), /cancelled/); assert.equal(frames, 0);
  assert.equal(sends, 4);
 } finally {
  for (const key of ['document', 'window', 'location', 'fetch']) { if (original[key]) Object.defineProperty(globalThis, key, original[key]); else Reflect.deleteProperty(globalThis, key); }
 }
});
