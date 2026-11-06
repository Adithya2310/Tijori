import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestViaNym } from '@tijori/client/anon-rpc';
import { parseRpcBalanceOf, parseRpcQuantity, validateReadRequest, verifyTestnetChain } from '@tijori/client/anon-rpc-protocol';

const request = { endpoint: 'https://rpc.testnet.whitechain.io', method: 'eth_chainId' as const, params: [] };

test('read-only boundary, JSON-RPC errors, and expected testnet are checked', () => {
 validateReadRequest(request);
 assert.throws(() => validateReadRequest({ ...request, method: 'eth_sendRawTransaction' as never }), /Only/);
 assert.throws(() => validateReadRequest({ ...request, endpoint: 'http://example.com' }), /HTTPS/);
 assert.throws(() => validateReadRequest({ ...request, params: ['extra'] }), /Only/);
 assert.equal(verifyTestnetChain(parseRpcQuantity({ jsonrpc: '2.0', id: 1, result: '0x752' })), '0x752');
 assert.throws(() => verifyTestnetChain('0xa41'), /Wrong chain/);
 assert.throws(() => parseRpcQuantity({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unavailable' } }), /unavailable/);
 for (const value of [null, { result: '0x752' }, { jsonrpc: '2.0', id: 2, result: '0x752' }, { jsonrpc: '2.0', id: 1, result: '0x00' }]) assert.throws(() => parseRpcQuantity(value));
});

test('only ERC-20 balanceOf calls and exact uint256 responses are accepted', () => {
 const token = '0x' + '12'.repeat(20), account = '34'.repeat(20);
 const call = { endpoint: request.endpoint, method: 'eth_call' as const, params: [{ to: token, data: '0x70a08231' + '0'.repeat(24) + account }, 'latest'] };
 validateReadRequest(call);
 assert.throws(() => validateReadRequest({ ...call, params: [{ to: token, data: '0xa9059cbb' + '0'.repeat(24) + account }, 'latest'] }), /Only/);
 assert.throws(() => validateReadRequest({ ...call, params: [{ ...call.params[0] as object, from: token }, 'latest'] }), /Only/);
 assert.throws(() => validateReadRequest({ ...call, params: [call.params[0], 'pending'] }), /Only/);
 const result = '0x' + '0'.repeat(63) + '1';
 assert.equal(parseRpcBalanceOf({ jsonrpc: '2.0', id: 1, result }), result);
 for (const invalid of ['0x1', '0x', '0x' + '0'.repeat(66)]) assert.throws(() => parseRpcBalanceOf({ jsonrpc: '2.0', id: 1, result: invalid }));
 assert.throws(() => parseRpcBalanceOf({ jsonrpc: '2.0', id: 1, error: { message: 'failed' } }), /failed/);
});

test('session owns frame, ports, timeout, cancellation, failure and success without direct fetch', async () => {
 const original = Object.getOwnPropertyDescriptors(globalThis);
 const events = new EventTarget();
 let frames = 0, sent = 0, removed = 0;
 let response: 'success' | 'error' | 'hang' = 'success';
 const origin = 'http://localhost:3000';
 const doc = {
  createElement: () => {
   const frame = { hidden: false, title: '', src: '',
    remove: () => { if (frames) { frames--; removed++; } },
    contentWindow: { postMessage: (_data: unknown, _origin: string, ports: MessagePort[]) => {
     sent++;
     if (response === 'success') ports[0].postMessage({ kind: 'result', result: '0x752' });
     if (response === 'error') ports[0].postMessage({ kind: 'error', message: 'worker failed' });
    } },
   };
   return frame;
  },
  body: { appendChild: (frame: { contentWindow: unknown }) => {
   frames++;
   queueMicrotask(() => {
    // An unrelated frame cannot initiate this session.
    events.dispatchEvent(new MessageEvent('message', { origin, data: { kind: 'nym-host-ready' } }));
    const event = new MessageEvent('message', { origin, data: { kind: 'nym-host-ready' } });
    Object.defineProperty(event, 'source', { value: frame.contentWindow });
    events.dispatchEvent(event);
   });
  } },
 };
 try {
  Object.defineProperties(globalThis, {
   document: { configurable: true, value: doc },
   window: { configurable: true, value: events },
   location: { configurable: true, value: { origin } },
   fetch: { configurable: true, value: () => { throw new Error('Direct fetch forbidden'); } },
  });
  assert.equal(await requestViaNym(request), '0x752'); assert.equal(frames, 0);
  response = 'error'; await assert.rejects(requestViaNym(request), /worker failed/); assert.equal(frames, 0);
  response = 'hang'; await assert.rejects(requestViaNym(request, { timeoutMs: 20 }), /timed out/); assert.equal(frames, 0);
  const controller = new AbortController();
  const pending = requestViaNym(request, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /cancelled/); assert.equal(frames, 0);
  await assert.rejects(requestViaNym(request, { signal: controller.signal }), /cancelled/); assert.equal(frames, 0);
  assert.equal(sent, 3); assert.equal(removed, 4);
 } finally {
  for (const key of ['document', 'window', 'location', 'fetch']) {
   if (original[key]) Object.defineProperty(globalThis, key, original[key]);
   else Reflect.deleteProperty(globalThis, key);
  }
 }
});
