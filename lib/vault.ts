import { randomUUID } from 'node:crypto';
import { isAddress } from 'viem';
import type { SafeRecord } from './safe.ts';
import { validKeyEnvelope, type KeyEnvelope } from './identity-key.ts';

export type Wallet = { id: string; name: string; address: string | null; legacy_id?: string; keyEnvelope?: KeyEnvelope; object_name: string; created_at: string };
export type Group = { id: string; name: string; frequency: string; created_at: string; memberIds: string[]; safe?: SafeRecord };
export type Transaction = { id: string; group_id: string; sender_id: string; recipient: string; amount: number; asset: string; note: string; status: 'pending' | 'completed'; created_at: string; approvalIds: string[] };
/** USDT payout from a guarded Whitechain Safe. Amounts are 6-decimal base units as strings. */
export type Proposal = { id: string; group_id: string; proposer_id: string; to: string; amount: string; note: string; invoice_id?: string; status: 'pending' | 'executed' | 'failed'; created_at: string; executed_at?: string; tx_hash?: string; session_id?: string; approver_ids?: string[]; safe_tx_hash?: string; gas_refund?: string };
/** Vendor invoice billed to a vault's inbox (Operate add-on). webhook_url is never returned in state. */
export type Invoice = { id: string; group_id: string; vendor_name: string; vendor_address: string; amount: string; memo: string; due_date: string; external_id?: string; webhook_url?: string; status: 'open' | 'paid'; created_at: string; reminders: number; last_reminded_at?: string; proposal_id?: string; paid_tx_hash?: string; paid_at?: string };
export type Vault = { version: 4; wallets: Wallet[]; groups: Group[]; transactions: Transaction[]; proposals: Proposal[]; invoices: Invoice[]; operations: { id: string; digest: string; identityId?: string }[] };
export class VaultError extends Error {}
export const emptyVault = (): Vault => ({ version: 4, wallets: [], groups: [], transactions: [], proposals: [], invoices: [], operations: [] });
const str = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const normalize = (x: unknown) => str(x).toLowerCase();
const requireValue = (condition: unknown, message: string) => { if (!condition) throw new VaultError(message); };
const identity = ({ id, name, address }: Wallet) => ({ id, name, address });
export function publicState(vault: Vault) {
 const find = (id: string) => identity(vault.wallets.find(w => w.id === id)!);
 return {
  wallets: vault.wallets.map(identity),
  groups: [...vault.groups].reverse().map(({ id, name, created_at, memberIds, safe }) => ({ id, name, created_at, ...(safe ? { safe } : {}), members: safe ? memberIds.map(find) : vault.wallets.filter(w => memberIds.includes(w.id)).map(identity) })),
  transactions: [...vault.transactions].reverse().map(({ approvalIds, ...t }) => ({ ...t, group_name: vault.groups.find(g => g.id === t.group_id)!.name, sender_name: find(t.sender_id).name, approvals: approvalIds.map(find) })),
  proposals: [...vault.proposals].reverse().map(({ approver_ids, ...p }) => ({ ...p, proposer_name: find(p.proposer_id).name, approvers: (approver_ids ?? []).map(find) })),
  invoices: [...vault.invoices].reverse().map(({ webhook_url, ...i }) => ({ ...i, has_webhook: !!webhook_url })),
 };
}
export function applyAction(vault: Vault, action: string, b: Record<string, unknown>) {
 let identityId: string | undefined;
 const now = new Date().toISOString();
 if (action === 'signup') {
  const name = str(b.name), object = str(b.objectName), address = normalize(b.address);
  requireValue(name && object && isAddress(address) && validKeyEnvelope(b.keyEnvelope), 'Enter your name and object and generate an encrypted identity key.');
  const existing = vault.wallets.find(w => w.address === address);
  requireValue(!existing?.object_name, 'This address is already registered. Please log in.');
  if (existing) { existing.name = name; existing.object_name = object; existing.keyEnvelope = b.keyEnvelope as KeyEnvelope; identityId = existing.id; }
  else { identityId = randomUUID(); vault.wallets.push({ id: identityId, name, address, keyEnvelope: b.keyEnvelope as KeyEnvelope, object_name: object, created_at: now }); }
 } else if (action === 'login') {
  const user = vault.wallets.find(w => w.address === normalize(b.address) && w.object_name === str(b.objectName) && w.object_name && w.keyEnvelope);
  requireValue(user, 'Address or object did not match an encrypted identity.'); identityId = user!.id;
 } else if (action === 'groups') {
  const name = str(b.name), creator = str(b.creatorId);
  const owner = vault.wallets.find(w => w.id === creator && w.object_name);
  requireValue(name && owner, 'Enter a vault name and sign in first.');
  const addresses = Array.isArray(b.addresses) ? [...new Set(b.addresses.map(normalize).filter(w => w && w !== owner!.address))] : [];
  requireValue(addresses.length && addresses.every(address => isAddress(address)), 'Add at least one valid member address.');
  const memberIds = [creator];
  for (const address of addresses) {
   let member = vault.wallets.find(w => w.address === address);
   if (!member) { member = { id: randomUUID(), name: address, object_name: '', address, created_at: now }; vault.wallets.push(member); }
   memberIds.push(member.id);
  }
  vault.groups.push({ id: randomUUID(), name, frequency: randomUUID(), created_at: now, memberIds });
 } else if (action === 'register-safe') {
  const name = str(b.name), creator = str(b.creatorId), safe = b.safe as SafeRecord;
  const owner = vault.wallets.find(w => w.id === creator && w.object_name);
  requireValue(name && owner && safe && !vault.groups.some(g => g.safe?.address.toLowerCase() === safe.address.toLowerCase()), 'The vault name, creator or Safe address is invalid or already registered.');
  const memberIds = [creator];
  for (const address of safe.owners.slice(1)) {
   const signer = address.toLowerCase();
   let member = vault.wallets.find(w => w.address === signer);
   if (!member) { member = { id: randomUUID(), name: signer, object_name: '', address: signer, created_at: now }; vault.wallets.push(member); }
   requireValue(member.id !== creator, 'A signer address cannot also be the creator identity address.');
   memberIds.push(member.id);
  }
  vault.groups.push({ id: randomUUID(), name, frequency: randomUUID(), created_at: now, memberIds, safe });
 } else if (action === 'transactions') {
  const group = vault.groups.find(g => g.id === str(b.groupId)), sender = str(b.senderId), amount = Number(b.amount);
  requireValue(group?.memberIds.includes(sender), 'The sender must be a vault member.');
  requireValue(!group?.safe, 'Use Safe to submit transactions for an on-chain vault.');
  requireValue(str(b.recipient) && str(b.asset) && Number.isFinite(amount) && amount > 0, 'Enter a recipient and a valid positive amount.');
  vault.transactions.push({ id: randomUUID(), group_id: group!.id, sender_id: sender, recipient: str(b.recipient), amount, asset: str(b.asset), note: str(b.note), status: 'pending', created_at: now, approvalIds: [sender] });
 } else if (action === 'approve') {
  const tx = vault.transactions.find(t => t.id === str(b.transactionId)), wallet = str(b.walletId);
  requireValue(tx?.status === 'pending', 'This transaction is no longer pending.');
  requireValue(!vault.groups.find(g => g.id === tx?.group_id)?.safe, 'On-chain vault approvals require Safe signatures.');
  const group = vault.groups.find(g => g.id === tx!.group_id)!;
  requireValue(group.memberIds.includes(wallet), 'Only vault members can approve.');
  requireValue(!tx!.approvalIds.includes(wallet), 'This wallet has already approved.');
  tx!.approvalIds.push(wallet);
  if (tx!.approvalIds.length >= Math.floor(group.memberIds.length / 2) + 1) tx!.status = 'completed';
 } else throw new VaultError('Unknown action.');
 return identityId;
}

// Decrypted bytes and migration files remain untrusted until validated.
export function validateVault(input: unknown): Vault {
 // Explicitly preserve legacy identifiers and relations without inventing addresses.
 const raw = input as { version?: unknown; wallets?: Array<Record<string, unknown>> };
 const v3 = (raw && (raw.version === 1 || raw.version === 2) && Array.isArray(raw.wallets) ? { ...raw, version: 3, wallets: raw.wallets.map(w => { const { world_id, ...rest } = w; const old = typeof world_id === 'string' ? world_id : ''; return { ...rest, address: isAddress(old) ? old.toLowerCase() : null, ...(!isAddress(old) ? { legacy_id: old } : {}) }; }) } : input) as { version?: unknown; proposals?: unknown; invoices?: unknown };
 // Explicit v3 -> v4 migration: adds empty Whitechain proposal and invoice collections. Nothing else changes.
 const v = (v3 && v3.version === 3 ? { ...v3, version: 4, proposals: Array.isArray(v3.proposals) ? v3.proposals : [], invoices: Array.isArray(v3.invoices) ? v3.invoices : [] } : v3) as Vault;
 const text = (x: unknown): x is string => typeof x === 'string' && x.length <= 8192;
 const unique = (xs: string[]) => new Set(xs).size === xs.length;
 if (!v || v.version !== 4 || !Array.isArray(v.wallets) || !Array.isArray(v.groups) || !Array.isArray(v.transactions) || !Array.isArray(v.proposals) || !Array.isArray(v.invoices) || !Array.isArray(v.operations)) throw new Error('Invalid vault state.');
 if (!v.wallets.every(w => w && [w.id, w.name, w.object_name, w.created_at].every(text) && w.id && (w.address === null ? text(w.legacy_id) && !!w.legacy_id : typeof w.address === 'string' && isAddress(w.address) && w.address === normalize(w.address)) && (w.keyEnvelope === undefined || validKeyEnvelope(w.keyEnvelope))) || !unique(v.wallets.map(w => w.id)) || !unique(v.wallets.filter(w => w.address !== null).map(w => w.address!)) || !unique(v.wallets.filter(w => w.legacy_id).map(w => w.legacy_id!))) throw new Error('Invalid wallet state.');
 const walletIds = new Set(v.wallets.map(w => w.id));
 const validSafe = (safe: SafeRecord | undefined, memberCount: number) => !safe || ((safe.chainId === 84532 || safe.chainId === 1874) && (safe.guard === undefined || isAddress(safe.guard)) && isAddress(safe.address) && Array.isArray(safe.owners) && safe.owners.length === memberCount && safe.owners.every(a => isAddress(a)) && unique(safe.owners.map(a => a.toLowerCase())) && safe.threshold === Math.floor(memberCount / 2) + 1 && /^0x[\da-f]{64}$/i.test(safe.deploymentTxHash) && /^(0|[1-9]\d{0,76})$/.test(safe.saltNonce));
 if (!v.groups.every(g => g && [g.id, g.name, g.frequency, g.created_at].every(text) && Array.isArray(g.memberIds) && g.memberIds.length >= 2 && g.memberIds.every(id => walletIds.has(id)) && unique(g.memberIds) && validSafe(g.safe, g.memberIds.length)) || !unique(v.groups.map(g => g.id)) || !unique(v.groups.map(g => g.frequency))) throw new Error('Invalid group state.');
 if (!v.transactions.every(t => { const group = v.groups.find(g => g.id === t?.group_id); return t && [t.id, t.group_id, t.sender_id, t.recipient, t.asset, t.note, t.created_at].every(text) && group?.memberIds.includes(t.sender_id) && Number.isFinite(t.amount) && t.amount > 0 && Array.isArray(t.approvalIds) && t.approvalIds.includes(t.sender_id) && unique(t.approvalIds) && t.approvalIds.every(id => group.memberIds.includes(id)) && t.status === (t.approvalIds.length > group.memberIds.length / 2 ? 'completed' : 'pending'); }) || !unique(v.transactions.map(t => t.id))) throw new Error('Invalid transaction state.');
 const units = (x: unknown) => typeof x === 'string' && /^[1-9]\d{0,15}$/.test(x);
 const hash = (x: unknown) => typeof x === 'string' && /^0x[\da-f]{64}$/i.test(x);
 const whitechainGroup = (id: string) => v.groups.find(g => g.id === id && g.safe?.chainId === 1874);
 if (!v.invoices.every(i => { const g = i && whitechainGroup(i.group_id); return !!g && [i.id, i.group_id, i.vendor_name, i.memo, i.created_at].every(text) && !!i.id && !!i.vendor_name && typeof i.vendor_address === 'string' && isAddress(i.vendor_address) && units(i.amount) && /^\d{4}-\d{2}-\d{2}$/.test(i.due_date) && (i.external_id === undefined || (text(i.external_id) && i.external_id.length <= 100)) && (i.webhook_url === undefined || (text(i.webhook_url) && i.webhook_url.length <= 2048)) && Number.isSafeInteger(i.reminders) && i.reminders >= 0 && (i.status === 'open' || (i.status === 'paid' && hash(i.paid_tx_hash) && text(i.paid_at))); }) || !unique(v.invoices.map(i => i.id))) throw new Error('Invalid invoice state.');
 if (!v.proposals.every(p => { const g = p && whitechainGroup(p.group_id); return !!g && [p.id, p.group_id, p.proposer_id, p.note, p.created_at].every(text) && !!p.id && g.memberIds.includes(p.proposer_id) && typeof p.to === 'string' && isAddress(p.to) && units(p.amount) && (p.invoice_id === undefined || v.invoices.some(i => i.id === p.invoice_id && i.group_id === p.group_id)) && (p.status === 'pending' || ((p.status === 'executed' || p.status === 'failed') && hash(p.tx_hash) && text(p.executed_at) && Array.isArray(p.approver_ids) && p.approver_ids.every(id => g.memberIds.includes(id)))); }) || !unique(v.proposals.map(p => p.id))) throw new Error('Invalid proposal state.');
 if (v.operations.length > 100 || !v.operations.every(o => o && text(o.id) && text(o.digest) && (o.identityId === undefined || walletIds.has(o.identityId))) || !unique(v.operations.map(o => o.id))) throw new Error('Invalid operation state.');
 return v;
}
