import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import { ACOUSTIC_CODE_ALPHABET, newAcousticCode, validAcousticCode } from '@tijori/core/acoustic-code';
import { applyAction, emptyVault, validateVault } from '@tijori/core/vault';
import { guardedInitializer, safeSetupAbi, vaultThreshold } from '@tijori/core/whitechain/safe-tx';
import { presenceProvider, simulatedPresenceProvider } from '@tijori/server/providers';

const addr = (n: number) => ('0x' + n.toString(16).padStart(40, '0')) as `0x${string}`;
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
const hash = `0x${'00'.repeat(32)}` as `0x${string}`;

test('acoustic codes: 6 characters from an unambiguous alphabet, in the modem format', () => {
 const codes = Array.from({ length: 200 }, newAcousticCode);
 assert.ok(codes.every(validAcousticCode));
 assert.ok(codes.every(code => [...code].every(c => ACOUSTIC_CODE_ALPHABET.includes(c))), 'no I, O, 0 or 1');
 assert.ok(new Set(codes).size > 190, 'random');
 for (const bad of ['abcdef', 'ABCDE', 'ABCDEFG', ' ABCDE', 'deadbeef', 42, null]) assert.equal(validAcousticCode(bad), false);
});

test('the default payment presence check is live and acoustic: modem codes, exact match, fresh sessions only', async () => {
 assert.equal(presenceProvider.mode, 'live');
 const expiresAt = new Date(Date.now() + 60_000).toISOString();
 const challenge = await presenceProvider.createChallenge({ sessionId: 's', vaultId: 'v', safeTxHash: hash, expiresAt });
 assert.ok(validAcousticCode(challenge.code), challenge.code);
 const context = { sessionId: 's', vaultId: 'v', identityId: 'i', safeTxHash: hash, challenge };
 const heard = (reference: string, challengeId = challenge.challengeId) => ({ reference, challengeId });
 const wrong = challenge.code.replace(/^./, c => (c === 'A' ? 'B' : 'A'));
 assert.equal((await presenceProvider.verify(context, heard(challenge.code))).accepted, true);
 assert.equal((await presenceProvider.verify(context, heard(wrong))).accepted, false);
 assert.equal((await presenceProvider.verify(context, heard(challenge.code, 'another-session'))).accepted, false);
 assert.equal((await presenceProvider.verify(context, undefined)).accepted, false);
 const expired = { ...context, challenge: { ...challenge, expiresAt: new Date(Date.now() - 1).toISOString() } };
 assert.equal((await presenceProvider.verify(expired, heard(challenge.code))).accepted, false);
 assert.equal(simulatedPresenceProvider.mode, 'simulated', 'the audio-free variant stays available, clearly labelled');
});

test('new vaults need every owner on-chain; stored majority vaults stay valid', () => {
 const owners = [addr(1), addr(2), addr(3)];
 const setup = decodeFunctionData({ abi: safeSetupAbi, data: guardedInitializer({ owners, setup: addr(0x5e), guard: addr(0x9a), verifier: addr(0x7e), fallbackHandler: addr(0xfb) }) });
 assert.equal(setup.args[1], 3n); assert.equal(vaultThreshold(3), 3);
 const vaultWith = (threshold: number) => {
  const vault = emptyVault();
  const a = applyAction(vault, 'signup', { name: 'Asha', address: addr(1), keyEnvelope, objectName: 'mug' })!;
  applyAction(vault, 'signup', { name: 'Ben', address: addr(2), keyEnvelope, objectName: 'book' });
  applyAction(vault, 'signup', { name: 'Chen', address: addr(3), keyEnvelope, objectName: 'pen' });
  applyAction(vault, 'register-safe', { name: 'Builders DAO', creatorId: a, safe: { chainId: 1874, address: addr(0x5afe), owners, threshold, deploymentTxHash: `0x${'aa'.repeat(32)}`, saltNonce: '7', guard: addr(0x9a) } });
  return vault;
 };
 assert.equal(validateVault(structuredClone(vaultWith(3))).groups[0].safe?.threshold, 3);
 assert.equal(validateVault(structuredClone(vaultWith(2))).groups[0].safe?.threshold, 2, 'vaults created before 0.2.0 keep their majority');
 assert.throws(() => validateVault(structuredClone(vaultWith(1))), /Invalid/);
});
