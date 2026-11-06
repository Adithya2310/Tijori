import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTypedData, recoverTypedDataAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { applyAction, emptyVault, publicState, validateVault, type Vault } from '../lib/vault.ts';
import { formatUsdt, parseUsdt } from '../lib/whitechain/chain.ts';
import { createInvoice, createProposal, recordExecution, remindInvoice, treasuryCsv } from '../lib/whitechain/domain.ts';
import { deriveMasterKey, inboxKeyFor, signWebhook, verifyInboxKey, webhookSecretFor } from '../lib/whitechain/keys.ts';
import { attestationTypedData, packSignatures, safeTxTypedData, sortAddresses } from '../lib/whitechain/safe-tx.ts';
import { verifyWebhook } from '@tijori/invoices';

const addr = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
function treasury() {
 const vault = emptyVault();
 const a = applyAction(vault, 'signup', { name: 'Asha', address: addr(1), keyEnvelope, objectName: 'mug' })!;
 const b = applyAction(vault, 'signup', { name: 'Ben', address: addr(2), keyEnvelope, objectName: 'book' })!;
 const outsider = applyAction(vault, 'signup', { name: 'Eve', address: addr(9), keyEnvelope, objectName: 'pen' })!;
 const safe = { chainId: 1874 as const, address: addr(0x5afe) as `0x${string}`, owners: [addr(1), addr(2), addr(3)] as `0x${string}`[], threshold: 2, deploymentTxHash: `0x${'aa'.repeat(32)}` as `0x${string}`, saltNonce: '7', guard: addr(0x9a) as `0x${string}` };
 applyAction(vault, 'register-safe', { name: 'Builders DAO', creatorId: a, safe });
 return { vault, a, b, outsider, vaultId: vault.groups[0].id };
}

test('USDT amounts parse to 6-decimal units and format back', () => {
 assert.equal(parseUsdt('12.5'), 12_500_000n);
 assert.equal(parseUsdt('0.000001'), 1n);
 assert.equal(formatUsdt(250_000_000n), '250');
 assert.equal(formatUsdt('1234567'), '1.234567');
 for (const bad of ['0', '-1', '1.0000001', 'abc', '', '1e6']) assert.throws(() => parseUsdt(bad));
});

test('v3 and v5 state migrate explicitly to v6 with empty treasury collections', () => {
 const fromV3 = validateVault({ version: 3, wallets: [], groups: [], transactions: [], operations: [] });
 assert.equal(fromV3.version, 6); assert.deepEqual([fromV3.proximitySessions, fromV3.proposals, fromV3.invoices], [[], [], []]);
 const fromV5 = validateVault({ version: 5, proximitySessions: [], wallets: [], groups: [], transactions: [], operations: [] });
 assert.equal(fromV5.version, 6); assert.deepEqual([fromV5.proposals, fromV5.invoices], [[], []]);
 assert.throws(() => validateVault({ ...fromV5, version: 7 }), /Invalid vault/);
});

test('proposals: members only, invoice payouts are bound to the invoice, executed payouts mark invoices paid', () => {
 const { vault, a, b, outsider, vaultId } = treasury();
 assert.throws(() => createProposal(vault, { vaultId, proposerId: outsider, to: addr(7), amount: '5' }), /Only vault members/);
 assert.throws(() => createProposal(vault, { vaultId, proposerId: a, to: addr(0x5afe), amount: '5' }), /cannot pay itself/);
 const { invoice } = createInvoice(vault, vaultId, { vendorName: 'Priya Studio', vendorAddress: addr(7), amount: '250', memo: 'Site', dueDate: '2026-11-20', externalId: 'INV-1' }, { allowPrivateWebhooks: false });
 const p = createProposal(vault, { vaultId, proposerId: b, invoiceId: invoice.id, to: addr(8), amount: '999999' });
 assert.equal(p.to, addr(7)); assert.equal(p.amount, '250000000'); // invoice wins over caller input
 assert.throws(() => createProposal(vault, { vaultId, proposerId: a, invoiceId: invoice.id }), /already has a pending/);
 validateVault(vault);
 recordExecution(vault, { proposalId: p.id, success: true, txHash: `0x${'bb'.repeat(32)}`, sessionId: 's1', approverIds: [a, b], safeTxHash: `0x${'cc'.repeat(32)}`, gasRefund: 150_000n });
 assert.equal(vault.invoices[0].status, 'paid'); assert.equal(vault.proposals[0].status, 'executed');
 recordExecution(vault, { proposalId: p.id, success: false, txHash: `0x${'dd'.repeat(32)}`, sessionId: 's2', approverIds: [a], safeTxHash: `0x${'cc'.repeat(32)}`, gasRefund: 0n });
 assert.equal(vault.proposals[0].tx_hash, `0x${'bb'.repeat(32)}`, 'recording is idempotent');
 validateVault(vault);
 const state = JSON.stringify(publicState(vault));
 assert.ok(!state.includes('webhook_url'));
});

test('invoices: idempotent externalId, validated fields, private webhooks gated, hourly reminders', () => {
 const { vault, vaultId } = treasury();
 const body = { vendorName: 'Studio', vendorAddress: addr(7), amount: '10', dueDate: '2026-12-01', externalId: 'A-1', webhookUrl: 'http://localhost:4000/hook' };
 assert.throws(() => createInvoice(vault, vaultId, body, { allowPrivateWebhooks: false }), /Private-network/);
 const first = createInvoice(vault, vaultId, body, { allowPrivateWebhooks: true });
 assert.equal(first.created, true);
 assert.equal(createInvoice(vault, vaultId, body, { allowPrivateWebhooks: true }).created, false);
 assert.throws(() => createInvoice(vault, vaultId, { ...body, externalId: 'A-2', dueDate: '01/12/2026' }, { allowPrivateWebhooks: true }), /due date/);
 assert.throws(() => createInvoice(vault, vaultId, { ...body, externalId: 'A-3', vendorAddress: 'nope' }, { allowPrivateWebhooks: true }), /payout address/);
 const now = new Date('2026-11-06T10:00:00Z');
 remindInvoice(vault, vaultId, first.invoice.id, now);
 assert.throws(() => remindInvoice(vault, vaultId, first.invoice.id, new Date('2026-11-06T10:30:00Z')), /less than an hour/);
 assert.equal(remindInvoice(vault, vaultId, first.invoice.id, new Date('2026-11-06T11:01:00Z')).reminders, 2);
 validateVault(vault);
});

test('webhook URLs on private networks are refused unless explicitly allowed', async () => {
 const { vault, vaultId } = treasury();
 const { isNonPublicAddress, resolvesToPublicAddresses } = await import('../lib/whitechain/net-guard.ts');
 for (const url of ['http://[::1]/h', 'http://[::ffff:7f00:1]/h', 'http://[fc00::1]/h', 'http://100.64.0.1/h', 'http://169.254.169.254/latest', 'http://intranet/h']) assert.throws(() => createInvoice(vault, vaultId, { vendorName: 'S', vendorAddress: addr(7), amount: '1', dueDate: '2026-12-01', webhookUrl: url }, { allowPrivateWebhooks: false }), /Private-network/, url);
 for (const ip of ['::ffff:10.0.0.1', '::', '0.0.0.0', '198.18.0.1']) assert.equal(isNonPublicAddress(ip), true, ip);
 assert.equal(isNonPublicAddress('8.8.8.8'), false);
 assert.equal(await resolvesToPublicAddresses('localhost'), false);
});

test('accountant CSV escapes spreadsheet formulas', () => {
 const { vault, a, vaultId } = treasury();
 createProposal(vault, { vaultId, proposerId: a, to: addr(7), amount: '1', note: '=HYPERLINK("x")' });
 const csv = treasuryCsv(vault, vaultId);
 assert.ok(csv.startsWith('proposed_at,'));
 assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});

test('inbox keys and webhook secrets are derived, vault-bound and tamper evident', () => {
 const master = deriveMasterKey('44'.repeat(32));
 const vaultId = '0f8fad5b-d9cb-469f-a165-70867728950e';
 const key = inboxKeyFor(master, vaultId);
 assert.equal(verifyInboxKey(master, key), vaultId);
 assert.equal(verifyInboxKey(master, key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A')), null);
 assert.equal(verifyInboxKey(deriveMasterKey('55'.repeat(32)), key), null);
 assert.equal(verifyInboxKey(master, 'Bearer nonsense'), null);
 const secret = webhookSecretFor(master, vaultId), body = '{"type":"invoice.paid"}';
 const header = signWebhook(secret, body, 1_800_000_000);
 assert.equal(verifyWebhook(body, header, secret, 300, 1_800_000_100), true);
 assert.equal(verifyWebhook(body + ' ', header, secret, 300, 1_800_000_100), false);
 assert.equal(verifyWebhook(body, header, secret, 300, 1_800_001_000), false, 'stale timestamps are rejected');
});

test('SafeTx and attestation typed data sign and recover; signatures pack in ascending signer order', async () => {
 const owners = [privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey())];
 const safe = addr(0x5afe) as `0x${string}`;
 const tx = { to: addr(0xdead) as `0x${string}`, value: 0n, data: '0x' as const, operation: 0 as const, safeTxGas: 1n, baseGas: 2n, gasPrice: 1n, gasToken: addr(0xdead) as `0x${string}`, refundReceiver: addr(0xbeef) as `0x${string}`, nonce: 0n };
 const typed = safeTxTypedData(1874, safe, tx);
 const entries = await Promise.all(owners.map(async o => ({ signer: o.address, signature: await o.signTypedData(typed) })));
 for (const e of entries) assert.equal(await recoverTypedDataAddress({ ...typed, signature: e.signature }), e.signer);
 const packed = packSignatures(entries), sorted = sortAddresses(owners.map(o => o.address));
 const first = entries.find(e => e.signer === sorted[0])!;
 assert.equal(packed.slice(0, 132), first.signature);
 const attestation = attestationTypedData(1874, addr(0x9a) as `0x${string}`, { safe, safeTxHash: hashTypedData(typed), sessionId: `0x${'01'.repeat(32)}`, approvers: sorted, ref: `0x${'02'.repeat(32)}`, expiresAt: 1n });
 assert.match(hashTypedData(attestation), /^0x[\da-f]{64}$/);
});

test('vault with a Whitechain Safe validates; proposals on legacy vaults are rejected', () => {
 const { vault } = treasury();
 const legacy: Vault = structuredClone(vault);
 legacy.groups[0].safe!.chainId = 84532;
 legacy.proposals.push({ id: 'p', group_id: legacy.groups[0].id, proposer_id: legacy.groups[0].memberIds[0], to: addr(7), amount: '1', note: '', status: 'pending', created_at: 'now' });
 assert.throws(() => validateVault(legacy), /Invalid proposal/);
});
