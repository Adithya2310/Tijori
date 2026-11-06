import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { listDeviceIdentities, saveDeviceIdentity, validateDeviceIdentity } from '../lib/device-identities.ts';
import { featuresFromTokens } from '../lib/dino.ts';
import { createObjectIdentity, verifyObjectRecovery } from '../lib/dino-wallet.ts';

test('remembered identity survives reopening storage, reuses a pending key, and rejects the wrong object', async () => {
 Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
 const tokens = new Float32Array(257 * 384);
 for (let i = 0; i < 257; i++) tokens[i * 384] = 1;
 const photo = featuresFromTokens(tokens, [1, 257, 384]);
 const recovery = await createObjectIdentity(photo);
 const pending = { version: 1 as const, name: 'Synthetic fixture', status: 'pending' as const, recovery };
 assert.deepEqual(await listDeviceIdentities(), []);
 await saveDeviceIdentity(pending);
 const [restored] = await listDeviceIdentities();
 assert.equal(restored.status, 'pending');
 assert.equal(restored.recovery.address, recovery.address);
 assert.ok((await verifyObjectRecovery(restored.recovery, photo)).matched);
 await saveDeviceIdentity({ ...restored, status: 'registered' });
 const saved = await listDeviceIdentities();
 assert.equal(saved.length, 1, 'updating registration must not generate/duplicate an identity');
 assert.equal(saved[0].status, 'registered');
 for (let i = 0; i < 257; i++) { tokens[i * 384] = 0; tokens[i * 384 + 1] = 1; }
 await assert.rejects(verifyObjectRecovery(saved[0].recovery, featuresFromTokens(tokens, [1, 257, 384])), /did not match/);
 assert.throws(() => validateDeviceIdentity({ ...pending, recovery: {} }), /Invalid/);
 Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
 await assert.rejects(saveDeviceIdentity(pending), /storage is unavailable/);
});
