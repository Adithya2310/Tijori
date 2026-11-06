import test from 'node:test';
import assert from 'node:assert/strict';
import { featuresFromTokens } from '../lib/dino.ts';
import { createObjectIdentity, parseObjectRecovery, verifyObjectRecovery, unlockObjectIdentity, DINO_OBJECT_NAME } from '../lib/dino-wallet.ts';
import { applyAction, emptyVault, publicState, validateVault } from '../lib/vault.ts';

function photo(axis: number) {
 const values = new Float32Array(257 * 384);
 for (let i = 0; i < 257; i++) values[i * 384 + axis] = 1;
 return featuresFromTokens(values, [1, 257, 384]);
}

test('object demo recovery validates the same random identity after file roundtrip', async () => {
 const features = photo(0), first = await createObjectIdentity(features), second = await createObjectIdentity(features);
 assert.notEqual(first.address, second.address, 'the image must not determine the private key');
 const recovery = parseObjectRecovery(JSON.stringify(first));
 assert.ok((await verifyObjectRecovery(recovery, features)).matched);
 await assert.rejects(verifyObjectRecovery(recovery, photo(1)), /did not match/);
 await assert.rejects(unlockObjectIdentity(recovery, second.keyEnvelope), /does not match/);
 const corrupted = structuredClone(recovery);
 corrupted.keyEnvelope.ciphertext = '00'.repeat(48);
 await assert.rejects(verifyObjectRecovery(corrupted, features), /Could not unlock/);
 assert.throws(() => parseObjectRecovery('null'), /Invalid/);
 assert.throws(() => parseObjectRecovery(JSON.stringify({ ...recovery, features: {} })), /Invalid/);
 // This is an explicitly insecure demo: file holders need no photograph to unwrap.
 await unlockObjectIdentity(recovery, recovery.keyEnvelope);
 // Existing v4 storage accepts only the ordinary encrypted envelope and marker.
 const vault = emptyVault();
 const body = { name: 'Synthetic object fixture', address: recovery.address, objectName: DINO_OBJECT_NAME, keyEnvelope: recovery.keyEnvelope };
 const id = applyAction(vault, 'signup', body);
 assert.equal(applyAction(vault, 'login', { address: recovery.address, objectName: DINO_OBJECT_NAME }), id);
 validateVault(vault);
 await unlockObjectIdentity(recovery, vault.wallets[0].keyEnvelope!);
 assert.ok(!JSON.stringify(vault).includes('patches'));
 assert.ok(!JSON.stringify(publicState(vault)).includes('ciphertext'));
});
