import { Buffer } from 'node:buffer';
import { type Vault } from '@tijori/core/vault';
import { withLocalStore } from './local-file.ts';
import { withArkiv, StorageError } from './arkiv.ts';
import { MAX_STATE_BYTES } from './codec.ts';

// Reject extra fields rather than silently uploading files/secrets or dropping existing data.
function fields(value: object, allowed: string) {
 const names = new Set(allowed.split(' '));
 if (Object.keys(value).some(name => !names.has(name))) throw new StorageError('Local state contains unsupported fields. Review it locally before migration; nothing was uploaded.');
}
function migrationState(v: Vault) {
 fields(v, 'version wallets groups transactions proximitySessions proposals invoices operations');
 for (const w of v.wallets) {
  fields(w, 'id name address legacy_id keyEnvelope objectProfile object_name created_at');
  if (w.keyEnvelope) fields(w.keyEnvelope, 'version salt iv ciphertext');
  // `model` is a model identifier, never model weights. Profiles contain compact descriptors only.
  if (w.objectProfile) fields(w.objectProfile, 'version encoding model revision data views');
 }
 for (const g of v.groups) {
  fields(g, 'id name frequency created_at memberIds safe');
  if (g.safe) fields(g.safe, 'address chainId owners threshold deploymentTxHash saltNonce guard');
 }
 for (const t of v.transactions) fields(t, 'id group_id sender_id recipient amount asset note status created_at approvalIds');
 for (const p of v.proposals) fields(p, 'id group_id proposer_id to amount note invoice_id status created_at executed_at tx_hash session_id approver_ids safe_tx_hash gas_refund');
 for (const i of v.invoices) fields(i, 'id group_id vendor_name vendor_address amount memo due_date external_id webhook_url status created_at reminders last_reminded_at proposal_id paid_tx_hash paid_at');
 for (const s of v.proximitySessions) {
  fields(s, 'id groupId hostId nonce createdAt expiresAt cancelled operationId matches');
  for (const m of s.matches) fields(m, 'walletId verifiedAt attestationHash');
 }
 for (const o of v.operations) fields(o, 'id digest identityId');
 const bytes = Buffer.byteLength(JSON.stringify(v));
 if (bytes > MAX_STATE_BYTES) throw new StorageError('Local state exceeds the Arkiv aggregate limit. Nothing was uploaded.');
 return { version: v.version, bytes, wallets: v.wallets.length, groups: v.groups.length, transactions: v.transactions.length, proximitySessions: v.proximitySessions.length, proposals: v.proposals.length, invoices: v.invoices.length, operations: v.operations.length };
}

/** Source remains locked and unchanged through receipt/readback. Preview makes no Arkiv calls. */
export async function migrateLocalToArkiv(directory?: string, write = false) {
 return withLocalStore(async source => {
  const { vault } = await source.read();
  const summary = migrationState(vault);
  if (!write) return { preview: true, migrated: false, ...summary };
  return withArkiv(async target => {
   const previous = await target.read();
   if (previous.entityKey) throw new StorageError('Arkiv state already exists. Migration will not merge or overwrite it. Select an explicitly approved empty namespace.');
   await target.write(vault, previous);
   if (JSON.stringify((await target.read()).vault) !== JSON.stringify(vault)) throw new StorageError('Migration readback mismatch. Inspect the Arkiv journal; do not repeat the write.');
   return { preview: false, migrated: true, ...summary, ...target.journal() };
  });
 }, directory, { existingOnly: true });
}
