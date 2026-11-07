import { createHash, randomUUID } from 'node:crypto';
import { decodeEventLog, encodeFunctionData, formatEther, getAddress, hashTypedData, isAddress, recoverMessageAddress, recoverTypedDataAddress, zeroAddress, type Address, type Hex, type TransactionReceipt } from 'viem';
import { withState, StorageError } from '../storage/index.ts';
import { applyAction, VaultError, type Vault } from '@tijori/core/vault';
import { currentProviders, emit, setting, waitUntil } from '../context.ts';
import '../providers.ts';
import { IntegrationUnavailableError } from '@tijori/core/integrations';
import { OBJECT_IDENTITY_NAME, validObjectQuery } from '@tijori/core/object-profile';
import { applicationState, REENROLL_MESSAGE } from '@tijori/core/api/domain';
import { LEGACY_DINO_OBJECT_NAME } from '@tijori/core/legacy';
import type { ApprovalSession, InboxKeyResponse, InvoiceReceipt, RelayerStatus, StartSessionResponse } from '@tijori/core/api/types';
import { WHITECHAIN_CHAIN_ID, explorerTx, formatUsdt } from '@tijori/core/whitechain/chain';
import { isRehearsalToken, isTreasuryConfigured, treasuryConfig, usdtAddress, whitechainClient } from '../whitechain/config.ts';
import { readWhitechainSafe } from '../whitechain/safe.ts';
import { attestationTypedData, erc20Abi, guardAbi, idToBytes32, inboxKeyMessage, packSignatures, safeAbi, safeTxTypedData, sortAddresses, usdtTransferData, type SafeTx } from '@tijori/core/whitechain/safe-tx';
import { bumpDaily, deployGuardedSafe, reconcilePending, relay, withTreasury, type Session, type TreasuryJournal } from '../whitechain/relayer.ts';
import { createInvoice, createProposal, invoiceView, memberWallet, recordExecution, remindInvoice, treasuryCsv, whitechainVault } from '@tijori/core/whitechain/domain';
import { deriveMasterKey, inboxKeyFor, signWebhook, verifyInboxKey, webhookSecretFor } from '../whitechain/keys.ts';
import { resolvesToPublicAddresses } from '../whitechain/net-guard.ts';

const str = (x: unknown, max = 200) => (typeof x === 'string' ? x.trim() : '').slice(0, max);
type Ctx = Parameters<Parameters<typeof withTreasury>[0]>[0];

function masterKey() {
 const secret = setting('TIJORI_API_MASTER_KEY')?.trim() || setting('ARKIV_STATE_ENCRYPTION_KEY')?.trim();
 if (!secret || !/^[\da-f]{64}$/i.test(secret)) throw new IntegrationUnavailableError('Set TIJORI_API_MASTER_KEY (32 bytes hex) to issue vendor inbox keys.');
 return deriveMasterKey(secret);
}
const operationId = (value: string | null | undefined) => {
 const id = value || randomUUID();
 if (!/^[\w-]{1,100}$/.test(id)) throw new VaultError('Invalid operation ID.');
 return id;
};
const digestOf = (action: string, body: unknown) => createHash('sha256').update(JSON.stringify([action, body])).digest('hex');

/** Durable, idempotent aggregate mutation, mirroring lib/api/service.ts mutate(). */
async function arkivMutation<T>(action: string, body: unknown, opId: string, identityId: string, change: (vault: Vault) => T, result: (vault: Vault, value: T | undefined) => unknown) {
 const digest = digestOf(action, body);
 return withState(async store => {
  const previous = await store.read(), vault = previous.vault;
  const saved = vault.operations.find(o => o.id === opId);
  if (saved && saved.digest !== digest) throw new VaultError('This operation ID was already used with different input.');
  let value: T | undefined;
  if (!saved) {
   value = change(vault);
   vault.operations.push({ id: opId, digest, identityId });
   vault.operations = vault.operations.slice(-100);
   await store.write(vault, previous);
  }
  return result(vault, value);
 });
}

export function treasuryCapabilities() {
 let guard: string | null = null;
 try { guard = treasuryConfig().guard; } catch { /* unconfigured */ }
 return { chainId: WHITECHAIN_CHAIN_ID, asset: isRehearsalToken() ? { symbol: 'rUSD', address: usdtAddress(), decimals: 6, rehearsal: true, qualifying: false } : { symbol: 'USDT', address: usdtAddress(), decimals: 6, rehearsal: false, qualifying: true }, configured: isTreasuryConfigured(), guard, presence: { provider: currentProviders().presence.id, mode: currentProviders().presence.mode }, execution: 'co-present-attested-relayer' };
}

// ---------- Vault creation (gasless, guarded) ----------
export async function createWhitechainVault(body: Record<string, unknown>, opHeader: string | null) {
 const name = str(body.name, 120), creatorId = str(body.creatorId, 100);
 if (!name) throw new VaultError('Enter a vault name of at most 120 characters.');
 treasuryConfig();
 const opId = operationId(opHeader);
 const creator = await withState(async store => (await store.read()).vault.wallets.find(w => w.id === creatorId && w.address && w.object_name && w.keyEnvelope));
 if (!creator) throw new VaultError('Sign in with an encrypted identity to create a vault.');
 const members = Array.isArray(body.addresses) ? body.addresses.map(a => str(a, 100)) : [];
 if (!members.length || members.length > 31 || !members.every(a => isAddress(a))) throw new VaultError('Add 1-31 valid signer addresses.');
 const owners = [getAddress(creator.address!), ...members.map(a => getAddress(a))];
 if (new Set(owners.map(o => o.toLowerCase())).size !== owners.length) throw new VaultError('Each signer address must be unique and different from yours.');
 // Every owner must approve each payout, so every owner needs an identity that can sign and join the acoustic check.
 const enrolled = await withState(async store => (await store.read()).vault.wallets.filter(w => w.address && w.object_name && w.keyEnvelope).map(w => w.address!.toLowerCase()));
 if (!members.every(a => enrolled.includes(a.toLowerCase()))) throw new VaultError('Every member needs a Tijori identity: sign up on their device first, then pick them from Registered people.');
 const already = await withState(async store => (await store.read()).vault.operations.find(o => o.id === opId));
 if (already && already.digest !== digestOf('whitechain-vault', { name, creatorId, owners })) throw new VaultError('This operation ID was already used with different input.');
 const deployed = already ? null : await deployGuardedSafe(opId, owners);
 return arkivMutation('whitechain-vault', { name, creatorId, owners }, opId, creatorId, vault => {
  const safe = { address: deployed!.address, chainId: WHITECHAIN_CHAIN_ID as 1874, owners: deployed!.owners, threshold: deployed!.threshold, deploymentTxHash: deployed!.deploymentTxHash, saltNonce: deployed!.saltNonce, guard: deployed!.guard };
  applyAction(vault, 'register-safe', { name, creatorId, safe });
  return true;
 }, (vault, created) => {
  const group = vault.groups.find(g => g.safe && g.safe.chainId === 1874 && g.safe.owners.join() === owners.join());
  if (group?.safe && created !== undefined) emit({ type: 'vault.created', vaultId: group.id, safe: group.safe.address, chainId: group.safe.chainId });
  return { ...applicationState(vault, creatorId), identityId: creatorId, vaultId: group?.id };
 });
}

// ---------- Proposals ----------
export async function proposePayout(body: Record<string, unknown>, opHeader: string | null) {
 const opId = operationId(opHeader);
 const proposerId = str(body.proposerId, 100);
 return arkivMutation('proposal', body, opId, proposerId, vault => createProposal(vault, body).id, (vault, id) => ({ ...applicationState(vault, proposerId), identityId: proposerId, proposalId: id }));
}

// ---------- Approval sessions ----------
const safeTxOf = (s: Session): SafeTx => ({ to: s.safeTx.to, value: BigInt(s.safeTx.value), data: s.safeTx.data, operation: 0, safeTxGas: BigInt(s.safeTx.safeTxGas), baseGas: BigInt(s.safeTx.baseGas), gasPrice: BigInt(s.safeTx.gasPrice), gasToken: s.safeTx.gasToken, refundReceiver: s.safeTx.refundReceiver, nonce: BigInt(s.safeTx.nonce) });
function sessionView(session: Session, vault: Vault, identityId?: string): ApprovalSession {
 const proposal = vault.proposals.find(p => p.id === session.proposalId);
 const invoice = vault.invoices.find(i => i.id === proposal?.invoice_id);
 const name = (id: string) => vault.wallets.find(w => w.id === id)?.name ?? 'Signer';
 const maxFee = BigInt(session.safeTx.gasPrice) * (BigInt(session.safeTx.safeTxGas) + BigInt(session.safeTx.baseGas));
 return {
  id: session.id, status: session.status, vaultId: session.vaultId, vaultName: vault.groups.find(g => g.id === session.vaultId)?.name ?? '', safe: session.safe, chainId: WHITECHAIN_CHAIN_ID,
  proposal: proposal ? { id: proposal.id, to: proposal.to, amount: formatUsdt(proposal.amount), note: proposal.note, vendor: invoice?.vendor_name ?? null } : null,
  initiator: name(session.initiatorId), threshold: session.threshold, approvals: session.approvals.map(a => ({ name: name(a.walletId), at: a.at })),
  approvedByMe: !!identityId && session.approvals.some(a => a.walletId === identityId), expiresAt: session.expiresAt,
  safeTx: session.safeTx, safeTxHash: session.safeTxHash, maxNetworkFeeUsdt: formatUsdt(maxFee), txHash: session.txHash ?? null, explorerUrl: session.txHash ? explorerTx(session.txHash) : null,
  presence: { provider: session.presence.provider, mode: session.presence.mode, challengeId: session.challenge.challengeId, ...(session.presence.mode === 'simulated' ? { simulatedCode: session.challenge.code } : {}) },
  error: session.error ?? null,
 };
}

export async function startApprovalSession(body: Record<string, unknown>): Promise<StartSessionResponse> {
 const proposalId = str(body.proposalId, 100), initiatorId = str(body.initiatorId, 100);
 return withTreasury(async ctx => {
  await reconcileSessions(ctx);
  const vault = await withState(async store => (await store.read()).vault);
  const proposal = vault.proposals.find(p => p.id === proposalId);
  if (!proposal || proposal.status !== 'pending') throw new VaultError('This proposal is not pending.');
  if (Object.values(ctx.journal.sessions).some(s => s.proposalId === proposalId && (s.status === 'executing' || s.status === 'submitted' || s.status === 'executed' || (s.status === 'failed' && !!s.txHash)))) throw new VaultError('This payout is already executing or executed on Whitechain. It will be recorded shortly.');
  const { group, wallet } = memberWallet(vault, proposal.group_id, initiatorId);
  const { config } = ctx, client = whitechainClient();
  const live = await readWhitechainSafe(group.safe!.address);
  if (live.guard !== config.guard) throw new VaultError('This vault is not protected by the configured presence guard.');
  const verifier = await client.readContract({ address: config.guard, abi: guardAbi, functionName: 'verifier', args: [live.address] });
  if (getAddress(verifier) !== config.verifier.address) throw new VaultError('This vault trusts a different Tijori verifier.');
  if (!wallet.address || !live.owners.some(o => o.toLowerCase() === wallet.address)) throw new VaultError('Only current vault signers can start an approval session.');
  const amount = BigInt(proposal.amount), data = usdtTransferData(proposal.to as Address, amount);
  let inner: bigint;
  const token = usdtAddress();
  try { inner = await client.estimateGas({ account: live.address, to: token, data }); }
  catch { throw new VaultError('The vault does not hold enough USDT for this payment.'); }
  const gasPrice = config.gasPriceMicroUsdt;
  const safeTx: SafeTx = { to: token, value: 0n, data, operation: 0, safeTxGas: inner * 13n / 10n + 10_000n, baseGas: config.baseGas, gasPrice, gasToken: gasPrice > 0n ? token : zeroAddress, refundReceiver: gasPrice > 0n ? config.relayer.address : zeroAddress, nonce: live.nonce };
  if (live.balanceUsdt < amount + gasPrice * (safeTx.safeTxGas + safeTx.baseGas)) throw new VaultError('The vault does not hold enough USDT for this payment and its network fee.');
  const safeTxHash = hashTypedData(safeTxTypedData(WHITECHAIN_CHAIN_ID, live.address, safeTx));
  const onchain = await client.readContract({ address: live.address, abi: safeAbi, functionName: 'getTransactionHash', args: [safeTx.to, safeTx.value, safeTx.data, safeTx.operation, safeTx.safeTxGas, safeTx.baseGas, safeTx.gasPrice, safeTx.gasToken, safeTx.refundReceiver, safeTx.nonce] });
  if (onchain !== safeTxHash) throw new StorageError('Safe transaction hash mismatch. No session was created.');
  for (const other of Object.values(ctx.journal.sessions)) if (other.vaultId === group.id && other.status === 'open') other.status = 'superseded';
  const id = randomUUID(), now = Date.now(), expiresAt = new Date(now + config.sessionSeconds * 1000).toISOString();
  const challenge = await currentProviders().presence.createChallenge({ sessionId: id, vaultId: group.id, safeTxHash, expiresAt });
  const session: Session = { id, proposalId, vaultId: group.id, safe: live.address, threshold: live.threshold, owners: live.owners, initiatorId, safeTx: { to: safeTx.to, value: '0', data, operation: 0, safeTxGas: safeTx.safeTxGas.toString(), baseGas: safeTx.baseGas.toString(), gasPrice: gasPrice.toString(), gasToken: safeTx.gasToken, refundReceiver: safeTx.refundReceiver, nonce: live.nonce.toString() }, safeTxHash, challenge, presence: { provider: currentProviders().presence.id, mode: currentProviders().presence.mode }, createdAt: new Date(now).toISOString(), expiresAt, approvals: [], status: 'open' };
  ctx.journal.sessions[id] = session; await ctx.save();
  // Only the initiator receives `emit`. In simulated mode, members' session listings also carry the code (documented limitation).
  return { session: sessionView(session, vault, initiatorId), emit: { challengeId: challenge.challengeId, code: challenge.code, expiresAt } };
 });
}

export async function listApprovalSessions(identityId: string): Promise<{ sessions: ApprovalSession[] }> {
 if (!isTreasuryConfigured()) return { sessions: [] };
 return withTreasury(async ctx => {
  await reconcileSessions(ctx);
  const vault = await withState(async store => (await store.read()).vault);
  if (!vault.wallets.some(w => w.id === identityId)) throw new VaultError('Unknown demo identity.');
  const recent = Date.now() - 15 * 60_000;
  const sessions = Object.values(ctx.journal.sessions).filter(s => vault.groups.find(g => g.id === s.vaultId)?.memberIds.includes(identityId) && (s.status === 'open' || s.status === 'executing' || s.status === 'submitted' || Date.parse(s.createdAt) > recent) && s.status !== 'superseded');
  return { sessions: sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(s => sessionView(s, vault, identityId)) };
 });
}

export async function approveInSession(body: Record<string, unknown>) {
 const sessionId = str(body.sessionId, 100), walletId = str(body.walletId, 100), signature = str(body.signature, 300) as Hex;
 return withTreasury(async ctx => {
  await reconcileSessions(ctx);
  const session = ctx.journal.sessions[sessionId];
  if (!session || session.status !== 'open') throw new VaultError('This approval session is not open.');
  if (Date.parse(session.expiresAt) <= Date.now()) { session.status = 'expired'; await ctx.save(); throw new VaultError('This approval session has expired. Start a new one together.'); }
  const vault = await withState(async store => (await store.read()).vault);
  const proposal = vault.proposals.find(p => p.id === session.proposalId);
  if (!proposal || proposal.status !== 'pending') throw new VaultError('This proposal is no longer pending.');
  const { wallet } = memberWallet(vault, session.vaultId, walletId);
  if (!wallet.address || !wallet.object_name) throw new VaultError('Only enrolled identities can approve.');
  if (wallet.object_name === LEGACY_DINO_OBJECT_NAME) throw new VaultError(REENROLL_MESSAGE);
  const retry = session.approvals.some(a => a.walletId === walletId);
  if (retry && session.approvals.length < session.threshold) throw new VaultError('You already approved in this session.');
  // 1. Personal object. Scanner v2 identities proved it at login: the server released the encrypted key that signs
  //    below only after their object matched, so no new photo is needed (a photo, if sent, is still checked).
  //    Older identities check their object description on every approval.
  const provenAtLogin = wallet.object_name === OBJECT_IDENTITY_NAME && !!wallet.objectProfile && !validObjectQuery(body.objectQuery);
  const object = provenAtLogin ? { accepted: true, mode: 'login' } : await currentProviders().objectMatching.verify({ identityId: wallet.id, address: wallet.address, objectName: wallet.object_name, ...(wallet.objectProfile ? { objectProfile: wallet.objectProfile } : {}) }, { objectName: str(body.objectName, 500), ...(validObjectQuery(body.objectQuery) ? { objectQuery: body.objectQuery } : {}), evidence: evidenceOf(body.objectEvidence) });
  if (!object.accepted) throw new VaultError('Your personal object did not match.');
  // 2. This device heard the session's acoustic code (same room, same time window).
  const presence = await currentProviders().presence.verify({ sessionId, vaultId: session.vaultId, identityId: wallet.id, safeTxHash: session.safeTxHash, challenge: session.challenge }, evidenceOf(body.evidence));
  if (!presence.accepted) throw new VaultError('This device did not hear the payment code. Stay together and listen again.');
  // 3. The approver's own key signed exactly this Safe transaction.
  if (!/^0x[\da-f]{130}$/i.test(signature)) throw new VaultError('A 65-byte signature is required.');
  let signer: Address;
  try { signer = await recoverTypedDataAddress({ ...safeTxTypedData(WHITECHAIN_CHAIN_ID, session.safe, safeTxOf(session)), signature }); }
  catch { throw new VaultError('The approval signature is invalid.'); }
  if (signer.toLowerCase() !== wallet.address || !session.owners.some(o => o.toLowerCase() === wallet.address)) throw new VaultError('The approval was not signed by your vault key.');
  // A repeat approval is only accepted to retry a quorum whose payout was not sent (re-verified above).
  if (!retry) { session.approvals.push({ walletId, address: getAddress(signer), signature, at: new Date().toISOString(), objectMode: object.mode, presenceMode: presence.mode }); delete session.error; }
  await ctx.save();
  if (session.approvals.length >= session.threshold) await finalize(ctx, session);
  const latest = await withState(async store => (await store.read()).vault);
  return { session: sessionView(session, latest, walletId), ...applicationState(latest, walletId) };
 });
}
function evidenceOf(value: unknown) {
 if (!value || typeof value !== 'object') return undefined;
 const e = value as Record<string, unknown>;
 return typeof e.reference === 'string' && typeof e.challengeId === 'string' && e.reference.length <= 256 && e.challengeId.length <= 256 ? { reference: e.reference, challengeId: e.challengeId } : undefined;
}

async function finalize(ctx: Ctx, session: Session) {
 const { config } = ctx;
 bumpDaily(ctx.journal, `exec:${session.safe}`, config.dailyExecutionCapPerVault, 'This vault reached its daily relayed execution limit.');
 session.status = 'executing'; delete session.error; await ctx.save();
 const approvers = sortAddresses(session.approvals.map(a => a.address));
 const attestation = { safe: session.safe, safeTxHash: session.safeTxHash, sessionId: idToBytes32(session.id), approvers, ref: idToBytes32(session.proposalId), expiresAt: BigInt(Math.floor(Date.parse(session.expiresAt) / 1000) + 300) };
 const verifierSignature = await config.verifier.signTypedData(attestationTypedData(WHITECHAIN_CHAIN_ID, config.guard, attestation));
 const t = safeTxOf(session);
 const data = encodeFunctionData({ abi: guardAbi, functionName: 'executeWithAttestation', args: [session.safe, { to: t.to, value: t.value, data: t.data, operation: t.operation, safeTxGas: t.safeTxGas, baseGas: t.baseGas, gasPrice: t.gasPrice, gasToken: t.gasToken, refundReceiver: t.refundReceiver }, packSignatures(session.approvals.map(a => ({ signer: a.address, signature: a.signature }))), attestation, verifierSignature] });
 let receipt: TransactionReceipt;
 try { receipt = await relay(ctx, { to: config.guard, data, purpose: 'execute', ref: session.id }); }
 catch (e) {
  if (ctx.journal.pending?.ref === session.id) { session.status = 'submitted'; session.txHash = ctx.journal.pending.hash; await ctx.save(); return; }
  const confirmed = ctx.journal.confirmed?.[session.id];
  if (confirmed) { session.status = 'submitted'; session.txHash = confirmed.hash; await ctx.save(); return; }
  // Nothing was broadcast: keep the approvals; any present approver can retry before the session expires.
  session.status = Date.parse(session.expiresAt) > Date.now() ? 'open' : 'expired';
  session.error = `${e instanceof Error ? e.message : 'Execution failed.'} Nothing was sent. Approve again to retry.`; await ctx.save(); return;
 }
 await applyReceipt(ctx, session, receipt);
}
async function applyReceipt(ctx: Ctx, session: Session, receipt: TransactionReceipt) {
 let success = false, payment = 0n;
 for (const log of receipt.logs) {
  try {
   if (getAddress(log.address) === session.safe) { const e = decodeEventLog({ abi: safeAbi, data: log.data, topics: log.topics }); if (e.eventName === 'ExecutionSuccess' || e.eventName === 'ExecutionFailure') payment = e.args.payment; }
   if (getAddress(log.address) === ctx.config.guard) { const e = decodeEventLog({ abi: guardAbi, data: log.data, topics: log.topics }); if (e.eventName === 'CoPresentExecution') success = e.args.success; }
  } catch { /* unrelated log */ }
 }
 session.txHash = receipt.transactionHash; session.gasRefund = payment.toString();
 session.status = receipt.status === 'success' && success ? 'executed' : 'failed';
 if (session.safeTx.gasToken !== zeroAddress) ctx.journal.refundsMicroUsdt = (BigInt(ctx.journal.refundsMicroUsdt) + payment).toString();
 await ctx.save();
 await recordSession(ctx, session);
}
async function recordSession(ctx: Ctx, session: Session) {
 if (session.recorded || !session.txHash || (session.status !== 'executed' && session.status !== 'failed')) return;
 try {
  const webhook = await withState(async store => {
   const previous = await store.read(), vault = previous.vault;
   const approverIds = session.approvals.map(a => a.walletId);
   const proposal = recordExecution(vault, { proposalId: session.proposalId, success: session.status === 'executed', txHash: session.txHash!, sessionId: session.id, approverIds, safeTxHash: session.safeTxHash, gasRefund: BigInt(session.gasRefund ?? '0') });
   await store.write(vault, previous);
   const invoice = vault.invoices.find(i => i.id === proposal.invoice_id && i.status === 'paid');
   emit({ type: 'proposal.executed', proposalId: proposal.id, vaultId: proposal.group_id, txHash: session.txHash!, success: session.status === 'executed' });
   if (invoice) emit({ type: 'invoice.paid', invoiceId: invoice.id, vaultId: invoice.group_id, txHash: session.txHash! });
   return invoice?.webhook_url ? { url: invoice.webhook_url, vaultId: invoice.group_id, payload: { type: 'invoice.paid', invoice: invoiceView(vault, invoice) } } : null;
  });
  session.recorded = true; await ctx.save();
  if (webhook) scheduleWebhook(webhook.url, webhook.vaultId, webhook.payload);
 } catch { /* Arkiv unavailable: the confirmed execution stays journaled and is recorded on the next reconcile. */ }
}
async function reconcileSessions(ctx: Ctx) {
 const pendingReceipt = await reconcilePending(ctx.journal, ctx.save).catch(() => null);
 for (const session of Object.values(ctx.journal.sessions)) {
  if (session.status === 'open' && Date.parse(session.expiresAt) <= Date.now()) { session.status = 'expired'; await ctx.save(); }
  if (session.status === 'executing' || session.status === 'submitted') {
   const hash = ctx.journal.pending?.ref === session.id ? ctx.journal.pending.hash : ctx.journal.confirmed?.[session.id]?.hash ?? session.txHash;
   if (hash && hash !== session.txHash) { session.txHash = hash; session.status = 'submitted'; await ctx.save(); }
   const receipt = !hash ? null : pendingReceipt?.transactionHash === hash ? pendingReceipt : await whitechainClient().getTransactionReceipt({ hash }).catch(() => null);
   const dropped = !!hash && !receipt && ctx.journal.pending?.ref !== session.id && !ctx.journal.confirmed?.[session.id];
   if (receipt) await applyReceipt(ctx, session, receipt);
   else if (!hash || dropped) {
    delete session.txHash;
    // Interrupted before signing: nothing was broadcast, so the quorum may retry while the session lasts.
    session.status = Date.parse(session.expiresAt) > Date.now() ? 'open' : 'expired';
    session.error = 'Execution was interrupted before anything was sent. Approve again to retry.'; await ctx.save();
   }
  }
  if (!session.recorded) await recordSession(ctx, session);
  const settled = session.recorded || session.status === 'expired' || session.status === 'superseded' || (session.status === 'open' && !session.approvals.length);
  if (settled && Date.now() - Date.parse(session.createdAt) > 2 * 86_400_000) delete ctx.journal.sessions[session.id];
 }
}

// ---------- Vendor invoice inbox (Operate) ----------
export async function issueInboxKey(body: Record<string, unknown>): Promise<InboxKeyResponse> {
 const vaultId = str(body.vaultId, 100), identityId = str(body.identityId, 100), issuedAt = str(body.issuedAt, 40), signature = str(body.signature, 300) as Hex, master = masterKey();
 const age = Date.now() - Date.parse(issuedAt);
 if (!(age >= -60_000 && age <= 300_000)) throw new VaultError('Sign a fresh inbox key request (at most 5 minutes old).');
 const { wallet } = await withState(async store => memberWallet((await store.read()).vault, vaultId, identityId));
 // The inbox key is a long-lived credential: require proof from the member's own identity key, not just their ID.
 let signer: Address;
 try { signer = await recoverMessageAddress({ message: inboxKeyMessage(vaultId, identityId, issuedAt), signature }); }
 catch { throw new VaultError('The inbox key request signature is invalid.'); }
 if (!wallet.address || signer.toLowerCase() !== wallet.address) throw new VaultError('The inbox key request was not signed by your identity key.');
 return { inboxKey: inboxKeyFor(master, vaultId), webhookSecret: webhookSecretFor(master, vaultId), endpoint: `${(setting('TIJORI_BASE_PATH') ?? '/api').replace(/\/+$/, '')}/v1/invoices` };
}
function inboxVault(authorization: string | null) {
 const vaultId = verifyInboxKey(masterKey(), authorization?.replace(/^Bearer\s+/i, '').trim());
 if (!vaultId) throw new AuthError('A valid vault inbox key is required.');
 return vaultId;
}
export class AuthError extends Error {}
const receiptPathFor = (id: string) => (setting('TIJORI_RECEIPT_PATH') || '/invoice/{id}').replace('{id}', encodeURIComponent(id));
const allowPrivateWebhooks = () => setting('TIJORI_WEBHOOK_ALLOW_PRIVATE') === '1';
export async function vendorCreateInvoice(authorization: string | null, body: Record<string, unknown>) {
 const vaultId = inboxVault(authorization);
 return withState(async store => {
  const previous = await store.read(), vault = previous.vault;
  const { invoice, created } = createInvoice(vault, vaultId, body, { allowPrivateWebhooks: allowPrivateWebhooks() });
  if (created) await store.write(vault, previous);
  return { invoice: invoiceView(vault, invoice), created, receiptPath: receiptPathFor(invoice.id) };
 });
}
export async function vendorGetInvoice(authorization: string | null, id: string | null) {
 const vaultId = inboxVault(authorization);
 return withState(async store => {
  const vault = (await store.read()).vault;
  const invoice = vault.invoices.find(i => i.id === id && i.group_id === vaultId);
  if (!invoice) throw new VaultError('Unknown invoice.');
  return { invoice: invoiceView(vault, invoice), receiptPath: receiptPathFor(invoice.id) };
 });
}
export async function vendorRemind(authorization: string | null, body: Record<string, unknown>) {
 const vaultId = inboxVault(authorization);
 return withState(async store => {
  const previous = await store.read(), vault = previous.vault;
  const invoice = remindInvoice(vault, vaultId, str(body.id, 100));
  await store.write(vault, previous);
  return { invoice: invoiceView(vault, invoice) };
 });
}
/** Public receipt: invoice IDs are unguessable capability URLs. */
export async function invoiceReceipt(id: string): Promise<InvoiceReceipt | null> {
 return withState(async store => {
  const vault = (await store.read()).vault;
  const invoice = vault.invoices.find(i => i.id === id);
  return invoice ? invoiceView(vault, invoice) : null;
 });
}
function scheduleWebhook(url: string, vaultId: string, payload: unknown) {
 let secret: string;
 try { secret = webhookSecretFor(masterKey(), vaultId); } catch { return; }
 const body = JSON.stringify(payload);
 const deliver = async () => {
  for (const delay of [0, 2_000, 10_000]) {
   if (delay) await new Promise(r => setTimeout(r, delay));
   // Re-check at delivery: DNS names must resolve only to public addresses (residual DNS-rebinding risk documented).
   if (!allowPrivateWebhooks() && !(await resolvesToPublicAddresses(new URL(url).hostname))) return;
   try {
    // Sign each attempt freshly. Tijori-Signature is current; Tichori-Signature is kept for existing receivers.
    const signature = signWebhook(secret, body);
    const res = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000), headers: { 'Content-Type': 'application/json', 'Tijori-Signature': signature, 'Tichori-Signature': signature }, body });
    if (res.ok) return;
   } catch { /* retry */ }
  }
 };
 waitUntil(deliver());
}

// ---------- Treasury export and gas tank ----------
export async function treasuryExport(vaultId: string | null, identityId: string | null) {
 return withState(async store => {
  const vault = (await store.read()).vault;
  memberWallet(vault, vaultId ?? '', identityId ?? '');
  return { csv: treasuryCsv(vault, vaultId!), filename: `tijori-${whitechainVault(vault, vaultId!).name.replace(/[^\w-]+/g, '-').toLowerCase()}-payouts.csv` };
 });
}
export async function relayerStatus(): Promise<RelayerStatus> {
 if (!isTreasuryConfigured()) return { configured: false as const };
 const config = treasuryConfig(), client = whitechainClient();
 const journal = await withTreasury(async ctx => structuredClone(ctx.journal) as TreasuryJournal);
 const [balance, usdt] = await Promise.all([client.getBalance({ address: config.relayer.address }), client.readContract({ address: usdtAddress(), abi: erc20Abi, functionName: 'balanceOf', args: [config.relayer.address] }).catch(() => 0n)]);
 const avg = journal.sent ? BigInt(journal.gasWei) / BigInt(journal.sent) : 1_500_000_000_000_000n;
 return {
  configured: true as const, address: config.relayer.address, guard: config.guard, verifier: config.verifier.address,
  balanceWbt: formatEther(balance), usdtBalance: formatUsdt(usdt), sponsoredTransactions: journal.sent, gasSpentWbt: formatEther(BigInt(journal.gasWei)),
  averageCostWbt: formatEther(avg), transactionsLeft: Number(balance / (avg || 1n)), refundsReceivedUsdt: formatUsdt(journal.refundsMicroUsdt),
  limits: { maxFeeGwei: config.maxFeeGwei, minBalanceWbt: formatEther(config.minRelayerWei), dailyVaultDeploys: config.dailyDeployCap, dailyExecutionsPerVault: config.dailyExecutionCapPerVault, gasRefundMicroUsdtPerGas: config.gasPriceMicroUsdt.toString() },
  pending: journal.pending ? { hash: journal.pending.hash, purpose: journal.pending.purpose } : null,
 };
}
