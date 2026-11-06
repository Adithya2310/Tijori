import { isAddress } from 'viem';
import { applyAction, publicState, VaultError, type Vault } from '../vault.ts';
import type { Evidence, IntegrationProviders } from '../integrations.ts';

export const requiredApprovals = (members: number) => Math.floor(members / 2) + 1;
export function evidenceFrom(value: unknown): Evidence | undefined {
 if (value === undefined) return undefined;
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VaultError('Invalid evidence reference.');
 const e = value as Record<string, unknown>;
 if (Object.keys(e).some(k => !['reference', 'challengeId'].includes(k)) || ![e.reference, e.challengeId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 256)) throw new VaultError('Evidence requires a reference and challengeId of at most 256 characters.');
 return { reference: e.reference as string, challengeId: e.challengeId as string };
}
function member(vault: Vault, identityId: string, groupId: string) {
 const group = vault.groups.find(g => g.id === groupId);
 if (!group?.memberIds.includes(identityId)) throw new VaultError('Only vault members can access this workflow.');
 return group;
}
export function applicationState(vault: Vault, identityId?: string) {
 const state = publicState(vault);
 if (identityId && !vault.wallets.some(w => w.id === identityId)) throw new VaultError('Unknown demo identity.');
 const groups = state.groups.filter(g => g.members.some(m => m.id === identityId));
 const visible = new Set(groups.map(g => g.id));
 const identities = new Set(groups.flatMap(g => g.members.map(m => m.id)));
 if (identityId) identities.add(identityId);
 return {
  wallets: state.wallets.filter(w => identities.has(w.id)),
  groups: groups.map(g => ({ ...g, requiredApprovals: g.safe?.threshold ?? requiredApprovals(g.members.length) })),
  transactions: state.transactions.filter(t => visible.has(t.group_id)).map(t => {
   const group = groups.find(g => g.id === t.group_id)!;
   return { ...t, requiredApprovals: requiredApprovals(group.members.length), canApprove: !group.safe && t.status === 'pending' && !t.approvals.some(a => a.id === identityId) };
  }),
  proposals: state.proposals.filter(p => visible.has(p.group_id)),
  invoices: state.invoices.filter(i => visible.has(i.group_id)),
 };
}
export async function verifyObject(vault: Vault, body: Record<string, unknown>, integrations: IntegrationProviders) {
 const address = typeof body.address === 'string' ? body.address.trim().toLowerCase() : '';
 const enrollment = vault.wallets.find(w => w.address === address && w.keyEnvelope && w.object_name);
 if (!enrollment || !isAddress(address)) throw new VaultError('Address or object did not match an encrypted identity.');
 const result = await integrations.objectMatching.verify({ identityId: enrollment.id, address, objectName: enrollment.object_name }, { objectName: typeof body.objectName === 'string' ? body.objectName : '', evidence: evidenceFrom(body.evidence) });
 if (!result.accepted) throw new VaultError('Address or object did not match an encrypted identity.');
 return { identityId: enrollment.id, verification: result };
}
export async function discoverRequests(vault: Vault, body: Record<string, unknown>, integrations: IntegrationProviders) {
 const identityId = typeof body.identityId === 'string' ? body.identityId : '';
 const groupId = typeof body.groupId === 'string' ? body.groupId : '';
 const group = member(vault, identityId, groupId);
 if (group.safe) throw new VaultError('On-chain vault requests are managed in Safe.');
 const verification = await integrations.physicalApproval.discover({ identityId, groupId, evidence: evidenceFrom(body.evidence) });
 if (!verification.accepted) throw new VaultError('Physical request discovery was not verified.');
 return { requests: applicationState(vault, identityId).transactions.filter(t => t.group_id === groupId && t.canApprove), verification };
}
/** Hooks execute before state changes. A rejected provider must never cause a write. */
export async function applyIntegratedAction(vault: Vault, action: string, body: Record<string, unknown>, integrations: IntegrationProviders) {
 if (action === 'signup') {
  // Validate the existing schema and invitation rules before calling a provider.
  applyAction(structuredClone(vault), action, body);
  const address = typeof body.address === 'string' ? body.address.trim().toLowerCase() : '';
  const objectName = typeof body.objectName === 'string' ? body.objectName.trim() : '';
  if (!isAddress(address) || !objectName) throw new VaultError('Enter a valid address and object description.');
  const result = await integrations.objectMatching.enroll({ address, objectName }, evidenceFrom(body.evidence));
  if (!result.accepted) throw new VaultError('Object enrollment was not verified.');
 }
 if (action === 'login') return (await verifyObject(vault, body, integrations)).identityId;
 if (action === 'approve') {
  const identityId = typeof body.walletId === 'string' ? body.walletId : '';
  const tx = vault.transactions.find(t => t.id === body.transactionId);
  if (!tx || tx.status !== 'pending' || tx.approvalIds.includes(identityId)) throw new VaultError('This transaction cannot be approved by this identity.');
  const group = member(vault, identityId, tx.group_id);
  if (group.safe) throw new VaultError('On-chain vault approvals require Safe signatures.');
  const result = await integrations.physicalApproval.verify({ identityId, groupId: group.id, transactionId: tx.id, recipient: tx.recipient, amount: tx.amount, asset: tx.asset }, evidenceFrom(body.evidence));
  if (!result.accepted) throw new VaultError('Physical approval was not verified.');
 }
 return applyAction(vault, action, body);
}
export function actionIdentity(action: string, body: Record<string, unknown>, identityId?: string) {
 const value = identityId ?? (action === 'approve' ? body.walletId : action === 'transactions' ? body.senderId : body.creatorId);
 return typeof value === 'string' ? value : undefined;
}
