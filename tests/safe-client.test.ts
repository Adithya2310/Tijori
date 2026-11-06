import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploySafe, ensureBaseSepolia, PENDING_SAFE_KEY, readPendingSafe } from '../lib/safe-client.ts';

test('a pending or corrupt deployment blocks another wallet submission', async () => {
 const values = new Map<string, string>();
 Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
 } });
 Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name: string, _options: unknown, run: (lock: object) => Promise<unknown>) => run({}) } } });
 let walletRequests = 0;
 Object.defineProperty(globalThis, 'window', { configurable: true, value: { ethereum: { request: async () => { walletRequests++; throw new Error('Must not request a wallet'); } } } });
 const pending = { version: 1, name: 'Existing', creatorId: 'demo', owners: ['0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222'], saltNonce: '1', address: '0x3333333333333333333333333333333333333333', phase: 'awaiting-wallet' };
 values.set(PENDING_SAFE_KEY, JSON.stringify(pending));
 assert.deepEqual(readPendingSafe(), pending);
 await assert.rejects(deploySafe('Another vault', 'demo', []), /already pending/);
 assert.equal(walletRequests, 0);
 values.set(PENDING_SAFE_KEY, '{invalid');
 assert.throws(readPendingSafe, /record is invalid/);
 await assert.rejects(deploySafe('Another vault', 'demo', []), /record is invalid/);
 assert.equal(walletRequests, 0);
 assert.equal(values.get(PENDING_SAFE_KEY), '{invalid');
});


test('network switch is skipped on Base Sepolia and requested on another chain', async () => {
 let chain = '0x14a34'; const calls: string[] = [];
 const provider = { async request({ method, params }: { method: string; params?: readonly unknown[] | object }) {
  calls.push(method);
  if (method === 'eth_chainId') return chain;
  assert.equal(method, 'wallet_switchEthereumChain');
  assert.deepEqual(params, [{ chainId: '0x14a34' }]); chain = '0x14a34'; return null;
 } };
 await ensureBaseSepolia(provider); assert.deepEqual(calls, ['eth_chainId']);
 calls.length = 0; chain = '0x1';
 await ensureBaseSepolia(provider);
 assert.deepEqual(calls, ['eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId']);
});

test('unknown network is added with Base Sepolia metadata and explicitly selected', async () => {
 let chain = '0x1', switches = 0; const calls: string[] = [];
 await ensureBaseSepolia({ async request({ method, params }) {
  calls.push(method);
  if (method === 'eth_chainId') return chain;
  if (method === 'wallet_switchEthereumChain') {
   if (++switches === 1) throw { code: 4902 };
   chain = '0x14a34'; return null;
  }
  assert.equal(method, 'wallet_addEthereumChain');
  const config = (params as { chainId: string; chainName: string; rpcUrls: string[] }[])[0];
  assert.equal(config.chainId, '0x14a34'); assert.equal(config.chainName, 'Base Sepolia');
  assert.deepEqual(config.rpcUrls, ['https://sepolia.base.org']); return null;
 } });
 assert.equal(switches, 2);
 assert.deepEqual(calls, ['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','eth_chainId','wallet_switchEthereumChain','eth_chainId']);
});

test('declined, pending and ineffective switches stop before deployment', async () => {
 for (const [code, message] of [[4001, /declined/], [-32002, /already open/], [-32601, /Could not switch/]] as const) {
  const calls: string[] = [];
  await assert.rejects(ensureBaseSepolia({ async request({ method }) {
   calls.push(method); if (method === 'eth_chainId') return '0x1'; throw { code };
  } }), message);
  assert.deepEqual(calls, ['eth_chainId', 'wallet_switchEthereumChain']);
 }
 await assert.rejects(ensureBaseSepolia({ async request({ method }) { return method === 'eth_chainId' ? '0x1' : null; } }), /still on another network/);
});
