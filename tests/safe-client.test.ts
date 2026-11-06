import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploySafe, PENDING_SAFE_KEY, readPendingSafe } from '../lib/safe-client.ts';

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
