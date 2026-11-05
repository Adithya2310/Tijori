import { randomUUID } from 'node:crypto';

export type Wallet = { id: string; name: string; world_id: string; object_name: string; created_at: string };
export type Group = { id: string; name: string; frequency: string; created_at: string; memberIds: string[] };
export type Transaction = { id: string; group_id: string; sender_id: string; recipient: string; amount: number; asset: string; note: string; status: 'pending' | 'completed'; created_at: string; approvalIds: string[] };
export type Vault = { version: 1; wallets: Wallet[]; groups: Group[]; transactions: Transaction[]; operations: { id: string; digest: string; identityId?: string }[] };
export class VaultError extends Error {}
export const emptyVault = (): Vault => ({ version: 1, wallets: [], groups: [], transactions: [], operations: [] });
const str = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const normalize = (x: unknown) => str(x).toLowerCase();
const requireValue = (condition: unknown, message: string) => { if (!condition) throw new VaultError(message); };
const identity = ({ id, name, world_id }: Wallet) => ({ id, name, world_id });
export function publicState(vault: Vault) {
 const find = (id: string) => identity(vault.wallets.find(w => w.id === id)!);
 return {
  wallets: vault.wallets.map(identity),
  groups: [...vault.groups].reverse().map(({ id, name, created_at, memberIds }) => ({ id, name, created_at, members: vault.wallets.filter(w => memberIds.includes(w.id)).map(identity) })),
  transactions: [...vault.transactions].reverse().map(({ approvalIds, ...t }) => ({ ...t, group_name: vault.groups.find(g => g.id === t.group_id)!.name, sender_name: find(t.sender_id).name, approvals: approvalIds.map(find) })),
 };
}
export function applyAction(vault: Vault, action: string, b: Record<string, unknown>) {
 let identityId: string | undefined;
 const now = new Date().toISOString();
 if (action === 'signup') {
  const name = str(b.name), object = str(b.objectName), world = normalize(b.worldId);
  requireValue(name && object && world, 'Enter your name, World ID and object.');
  const existing = vault.wallets.find(w => w.world_id === world);
  requireValue(!existing?.object_name, 'This World ID is already registered. Please log in.');
  if (existing) { existing.name = name; existing.object_name = object; identityId = existing.id; }
  else { identityId = randomUUID(); vault.wallets.push({ id: identityId, name, world_id: world, object_name: object, created_at: now }); }
 } else if (action === 'login') {
  const user = vault.wallets.find(w => w.world_id === normalize(b.worldId) && w.object_name === str(b.objectName) && w.object_name);
  requireValue(user, 'World ID or object did not match. Please try again.'); identityId = user!.id;
 } else if (action === 'groups') {
  const name = str(b.name), creator = str(b.creatorId);
  const owner = vault.wallets.find(w => w.id === creator && w.object_name);
  requireValue(name && owner, 'Enter a group name and sign in first.');
  const worlds = Array.isArray(b.worldIds) ? [...new Set(b.worldIds.map(normalize).filter(w => w && w !== owner!.world_id))] : [];
  requireValue(worlds.length, 'Add at least one other member by World ID.');
  const memberIds = [creator];
  for (const world of worlds) {
   let member = vault.wallets.find(w => w.world_id === world);
   if (!member) { member = { id: randomUUID(), name: world, object_name: '', world_id: world, created_at: now }; vault.wallets.push(member); }
   memberIds.push(member.id);
  }
  vault.groups.push({ id: randomUUID(), name, frequency: randomUUID(), created_at: now, memberIds });
 } else if (action === 'transactions') {
  const group = vault.groups.find(g => g.id === str(b.groupId)), sender = str(b.senderId), amount = Number(b.amount);
  requireValue(group?.memberIds.includes(sender), 'The sender must be a group member.');
  requireValue(str(b.recipient) && str(b.asset) && Number.isFinite(amount) && amount > 0, 'Enter a recipient and a valid positive amount.');
  vault.transactions.push({ id: randomUUID(), group_id: group!.id, sender_id: sender, recipient: str(b.recipient), amount, asset: str(b.asset), note: str(b.note), status: 'pending', created_at: now, approvalIds: [sender] });
 } else if (action === 'approve') {
  const tx = vault.transactions.find(t => t.id === str(b.transactionId)), wallet = str(b.walletId);
  requireValue(tx?.status === 'pending', 'This transaction is no longer pending.');
  const group = vault.groups.find(g => g.id === tx!.group_id)!;
  requireValue(group.memberIds.includes(wallet), 'Only group members can approve.');
  requireValue(!tx!.approvalIds.includes(wallet), 'This wallet has already approved.');
  tx!.approvalIds.push(wallet);
  if (tx!.approvalIds.length >= Math.floor(group.memberIds.length / 2) + 1) tx!.status = 'completed';
 } else throw new VaultError('Unknown action.');
 return identityId;
}

// Decrypted bytes and migration files remain untrusted until validated.
export function validateVault(input: unknown): Vault {
 const v = input as Vault;
 const text = (x: unknown): x is string => typeof x === 'string' && x.length <= 8192;
 const unique = (xs: string[]) => new Set(xs).size === xs.length;
 if (!v || v.version !== 1 || !Array.isArray(v.wallets) || !Array.isArray(v.groups) || !Array.isArray(v.transactions) || !Array.isArray(v.operations)) throw new Error('Invalid vault state.');
 if (!v.wallets.every(w => w && [w.id, w.name, w.world_id, w.object_name, w.created_at].every(text) && w.id && w.world_id && w.world_id === normalize(w.world_id)) || !unique(v.wallets.map(w => w.id)) || !unique(v.wallets.map(w => w.world_id))) throw new Error('Invalid wallet state.');
 const walletIds = new Set(v.wallets.map(w => w.id));
 if (!v.groups.every(g => g && [g.id, g.name, g.frequency, g.created_at].every(text) && Array.isArray(g.memberIds) && g.memberIds.length >= 2 && g.memberIds.every(id => walletIds.has(id)) && unique(g.memberIds)) || !unique(v.groups.map(g => g.id)) || !unique(v.groups.map(g => g.frequency))) throw new Error('Invalid group state.');
 if (!v.transactions.every(t => { const group = v.groups.find(g => g.id === t?.group_id); return t && [t.id, t.group_id, t.sender_id, t.recipient, t.asset, t.note, t.created_at].every(text) && group?.memberIds.includes(t.sender_id) && Number.isFinite(t.amount) && t.amount > 0 && Array.isArray(t.approvalIds) && t.approvalIds.includes(t.sender_id) && unique(t.approvalIds) && t.approvalIds.every(id => group.memberIds.includes(id)) && t.status === (t.approvalIds.length > group.memberIds.length / 2 ? 'completed' : 'pending'); }) || !unique(v.transactions.map(t => t.id))) throw new Error('Invalid transaction state.');
 if (v.operations.length > 100 || !v.operations.every(o => o && text(o.id) && text(o.digest) && (o.identityId === undefined || walletIds.has(o.identityId))) || !unique(v.operations.map(o => o.id))) throw new Error('Invalid operation state.');
 return v;
}
