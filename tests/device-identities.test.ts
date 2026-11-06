import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { listDeviceIdentities, saveDeviceIdentity, validateDeviceIdentity } from '../lib/device-identities.ts';
import { objectFeatures } from './fixtures/object-features.ts';
import { createObjectIdentity, verifyObjectRecovery } from '../lib/dino-wallet.ts';

test('remembered identity survives reopening storage, reuses a pending key, and rejects the wrong object', async () => {
 Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
 const photo = objectFeatures();
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
 await assert.rejects(verifyObjectRecovery(saved[0].recovery, objectFeatures(64)), /did not match/);
 assert.throws(() => validateDeviceIdentity({ ...pending, recovery: {} }), /Invalid/);
 Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
 await assert.rejects(saveDeviceIdentity(pending), /storage is unavailable/);
});
