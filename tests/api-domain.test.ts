import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, emptyVault } from '@tijori/core/vault';
import { applicationState, applyIntegratedAction, discoverRequests, evidenceFrom, verifyObject } from '@tijori/core/api/domain';
import { providers } from '@tijori/server/providers';
import type { IntegrationProviders } from '@tijori/core/integrations';
import { createTichoriClient } from '../lib/api/client.ts';

const address = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
function fixture() {
 const vault = emptyVault();
 const creator = applyAction(vault, 'signup', { name: 'A', address: address(1), keyEnvelope, objectName: 'mug' })!;
 const other = applyAction(vault, 'signup', { name: 'B', address: address(2), keyEnvelope, objectName: 'book' })!;
 const outsider = applyAction(vault, 'signup', { name: 'C', address: address(3), keyEnvelope, objectName: 'pen' })!;
 applyAction(vault, 'groups', { name: 'Pair', creatorId: creator, addresses: [address(2)] });
 const groupId = vault.groups[0].id;
 applyAction(vault, 'transactions', { groupId, senderId: creator, recipient: 'demo', amount: 1, asset: 'ETH' });
 return { vault, creator, other, outsider, groupId, transactionId: vault.transactions[0].id };
}
test('server supplies visibility, quorum and approval eligibility without leaking enrollment fields', () => {
 const { vault, creator, other, outsider } = fixture();
 const state = applicationState(vault, other);
 assert.equal(state.groups[0].requiredApprovals, 2);
 assert.equal(state.transactions[0].requiredApprovals, 2);
 assert.equal(state.transactions[0].canApprove, true);
 assert.equal(applicationState(vault, creator).transactions[0].canApprove, false);
 assert.equal(applicationState(vault, outsider).groups.length, 0);
 assert.equal(applicationState(vault).wallets.length, 0);
 assert.equal(applicationState(vault, outsider).transactions.length, 0);
 assert.ok(!JSON.stringify(state).includes('keyEnvelope'));
 assert.ok(!JSON.stringify(state).includes('object_name'));
 assert.throws(() => applicationState(vault, 'missing'), /Unknown/);
});
test('object provider receives stored enrollment and rejection leaves state unchanged', async () => {
 const { vault } = fixture();
 const before = structuredClone(vault);
 let called = false;
 const integrations: IntegrationProviders = { ...providers, objectMatching: { ...providers.objectMatching, async verify(enrollment, input) {
  called = true; assert.equal(enrollment.objectName, 'mug'); assert.equal(input.evidence?.reference, 'capture-1');
  return { accepted: false, mode: 'live', provider: 'test' };
 } } };
 await assert.rejects(applyIntegratedAction(vault, 'login', { address: address(1), evidence: { reference: 'capture-1', challengeId: 'challenge-1' } }, integrations), /did not match/);
 assert.equal(called, true); assert.deepEqual(vault, before);
 await assert.rejects(verifyObject(vault, { address: address(1), objectName: 'wrong' }, providers), /did not match/);
 assert.equal((await verifyObject(vault, { address: address(1), objectName: 'mug' }, providers)).verification.mode, 'simulated');
});
test('a replacement object provider controls verification without the demo description comparison', async () => {
 const { vault } = fixture();
 const integrations: IntegrationProviders = { ...providers, objectMatching: { ...providers.objectMatching, async verify() { return { accepted: true, mode: 'live', provider: 'replacement-test' }; } } };
 const identityId = await applyIntegratedAction(vault, 'login', { address: address(1), evidence: { reference: 'capture', challengeId: 'challenge' } }, integrations);
 assert.equal(identityId, vault.wallets[0].id);
});
test('invalid signup is rejected before an enrollment provider is called', async () => {
 const vault = emptyVault(); let called = false;
 const integrations: IntegrationProviders = { ...providers, objectMatching: { ...providers.objectMatching, async enroll() { called = true; return { accepted: true, mode: 'live', provider: 'test' }; } } };
 await assert.rejects(applyIntegratedAction(vault, 'signup', { name: 'A', address: address(1), objectName: 'mug' }, integrations));
 assert.equal(called, false); assert.equal(vault.wallets.length, 0);
});
test('enrollment hook may reject signup without creating a wallet', async () => {
 const vault = emptyVault();
 const integrations: IntegrationProviders = { ...providers, objectMatching: { ...providers.objectMatching, async enroll() { return { accepted: false, mode: 'live', provider: 'test' }; } } };
 await assert.rejects(applyIntegratedAction(vault, 'signup', { name: 'A', address: address(1), keyEnvelope, objectName: 'mug' }, integrations), /not verified/);
 assert.equal(vault.wallets.length, 0);
});
test('discovery and physical approval use providers and reject outsiders before calling them', async () => {
 const { vault, other, outsider, groupId, transactionId } = fixture();
 const before = structuredClone(vault);
 const discovery = await discoverRequests(vault, { identityId: other, groupId }, providers);
 assert.equal(discovery.requests[0].id, transactionId);
 assert.equal(discovery.verification.mode, 'simulated');
 assert.deepEqual(vault, before);
 let calls = 0;
 const integrations: IntegrationProviders = { ...providers, physicalApproval: { ...providers.physicalApproval, async verify(context, evidence) {
  calls++; assert.equal(context.transactionId, transactionId); assert.equal(context.recipient, 'demo'); assert.equal(evidence?.challengeId, 'challenge');
  return { accepted: false, mode: 'live', provider: 'test' };
 } } };
 await assert.rejects(applyIntegratedAction(vault, 'approve', { walletId: outsider, transactionId }, integrations), /Only vault members/);
 assert.equal(calls, 0);
 await assert.rejects(applyIntegratedAction(vault, 'approve', { walletId: other, transactionId, evidence: { reference: 'capture', challengeId: 'challenge' } }, integrations), /not verified/);
 assert.equal(calls, 1); assert.deepEqual(vault, before);
 await applyIntegratedAction(vault, 'approve', { walletId: other, transactionId }, providers);
 assert.equal(vault.transactions[0].status, 'completed');
 assert.equal(applicationState(vault, other).transactions[0].canApprove, false);
});
test('evidence references reject arbitrary payloads and external integration stays unavailable', async () => {
 assert.throws(() => evidenceFrom({ reference: 'capture', challengeId: 'challenge', image: 'raw-image' }), /Evidence requires/);
 assert.throws(() => evidenceFrom({ reference: 'capture' }), /Evidence requires/);
 await assert.rejects(providers.externalVault.verifyApproval({ applicationId: 'demo', identityAddress: address(1), vaultAddress: address(2), chainId: 84532, transactionHash: '0x' + 'aa'.repeat(32), evidence: { reference: 'capture', challengeId: 'challenge' } }), /not configured/);
});
test('API client maps actions to v1 endpoints and preserves retry IDs', async () => {
 const calls: { url: string; init?: RequestInit }[] = [];
 const client = createTichoriClient('http://localhost/api/v1/', async (input, init) => {
  calls.push({ url: String(input), init });
  return Response.json({ wallets: [], groups: [], transactions: [] });
 });
 await client.mutate('approve', { walletId: 'demo', transactionId: 'tx' }, 'retry-id');
 assert.equal(calls[0].url, 'http://localhost/api/v1/physical-approvals');
 assert.equal((calls[0].init?.headers as Record<string, string>)['Idempotency-Key'], 'retry-id');
 await client.state('identity with spaces');
 assert.ok(calls[1].url.endsWith('?identityId=identity%20with%20spaces'));
});
