// Pure treasury domain rules over the vault aggregate. No I/O; callers persist through withState (Arkiv or local storage).
import { randomUUID } from 'node:crypto';
import { getAddress, isAddress } from 'viem';
import { VaultError, type Invoice, type Proposal, type Vault } from '../vault.ts';
import { explorerTx, formatUsdt, parseUsdt } from './chain.ts';
import { isNonPublicHostname } from './net-guard.ts';

const str = (x: unknown, max = 500) => (typeof x === 'string' ? x.trim() : '').slice(0, max);
const fail = (message: string): never => { throw new VaultError(message); };

export function whitechainVault(vault: Vault, vaultId: string) {
 const group = vault.groups.find(g => g.id === vaultId);
 if (!group?.safe || group.safe.chainId !== 1874) fail('Choose a Whitechain vault.');
 return group!;
}
export function memberWallet(vault: Vault, vaultId: string, identityId: string) {
 const group = whitechainVault(vault, vaultId);
 const wallet = vault.wallets.find(w => w.id === identityId);
 if (!wallet || !group.memberIds.includes(identityId)) fail('Only vault members can use this vault.');
 return { group, wallet: wallet! };
}
function amountUnits(value: unknown) {
 try { return parseUsdt(value); } catch (e) { return fail((e as Error).message); }
}

export function createProposal(vault: Vault, body: Record<string, unknown>, now = new Date().toISOString()): Proposal {
 const vaultId = str(body.vaultId, 100), proposerId = str(body.proposerId, 100), note = str(body.note, 280);
 const { group, wallet } = memberWallet(vault, vaultId, proposerId);
 if (!wallet.address || !wallet.object_name) fail('Sign in with an encrypted identity to propose payments.');
 let to = str(body.to, 100), amount: bigint, invoice: Invoice | undefined;
 if (body.invoiceId !== undefined) {
  invoice = vault.invoices.find(i => i.id === str(body.invoiceId, 100) && i.group_id === group.id);
  if (!invoice || invoice.status !== 'open') fail('This invoice is not open.');
  if (vault.proposals.some(p => p.invoice_id === invoice!.id && p.status === 'pending')) fail('This invoice already has a pending payment proposal.');
  to = invoice!.vendor_address; amount = BigInt(invoice!.amount);
 } else amount = amountUnits(body.amount);
 if (!isAddress(to)) fail('Enter a valid recipient address.');
 if (group.safe!.address.toLowerCase() === to.toLowerCase()) fail('The vault cannot pay itself.');
 const proposal: Proposal = { id: randomUUID(), group_id: group.id, proposer_id: proposerId, to: getAddress(to).toLowerCase(), amount: amount!.toString(), note: note || invoice?.memo.slice(0, 280) || '', status: 'pending', created_at: now, ...(invoice ? { invoice_id: invoice.id } : {}) };
 vault.proposals.push(proposal);
 return proposal;
}

export function recordExecution(vault: Vault, input: { proposalId: string; success: boolean; txHash: string; sessionId: string; approverIds: string[]; safeTxHash: string; gasRefund: bigint }, now = new Date().toISOString()) {
 const proposal = vault.proposals.find(p => p.id === input.proposalId);
 if (!proposal) fail('Unknown proposal.');
 if (proposal!.status !== 'pending') return proposal!; // Idempotent: already recorded.
 Object.assign(proposal!, { status: input.success ? 'executed' : 'failed', tx_hash: input.txHash, session_id: input.sessionId, approver_ids: input.approverIds, safe_tx_hash: input.safeTxHash, gas_refund: input.gasRefund.toString(), executed_at: now });
 if (input.success && proposal!.invoice_id) {
  const invoice = vault.invoices.find(i => i.id === proposal!.invoice_id)!;
  Object.assign(invoice, { status: 'paid', paid_tx_hash: input.txHash, paid_at: now, proposal_id: proposal!.id });
 }
 return proposal!;
}

export function validWebhookUrl(value: unknown, allowPrivate: boolean) {
 if (value === undefined || value === null || value === '') return undefined;
 let url: URL;
 try { url = new URL(String(value)); } catch { return fail('Enter a valid webhook URL.'); }
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || String(value).length > 2048) fail('Webhook URLs must be plain http(s) URLs.');
 if (!allowPrivate && isNonPublicHostname(url.hostname)) fail('Private-network webhook URLs are disabled on this server.');
 return url.toString();
}

export function createInvoice(vault: Vault, vaultId: string, body: Record<string, unknown>, options: { allowPrivateWebhooks: boolean }, now = new Date().toISOString()): { invoice: Invoice; created: boolean } {
 const group = whitechainVault(vault, vaultId);
 const externalId = body.externalId === undefined ? undefined : str(body.externalId, 100);
 if (externalId !== undefined && !/^[\w.:-]{1,100}$/.test(externalId)) fail('externalId must be 1-100 letters, digits or ._:- characters.');
 const existing = externalId ? vault.invoices.find(i => i.group_id === group.id && i.external_id === externalId) : undefined;
 if (existing) return { invoice: existing, created: false };
 const vendorName = str(body.vendorName, 120), memo = str(body.memo, 500), dueDate = str(body.dueDate, 10), vendorAddress = str(body.vendorAddress, 100);
 if (!vendorName) fail('Enter the vendor name.');
 if (!isAddress(vendorAddress)) fail('Enter the vendor payout address.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate + 'T00:00:00Z'))) fail('Enter a due date as YYYY-MM-DD.');
 const amount = amountUnits(body.amount);
 if (vault.invoices.filter(i => i.group_id === group.id && i.status === 'open').length >= 50) fail('This inbox has too many open invoices.');
 const invoice: Invoice = { id: randomUUID(), group_id: group.id, vendor_name: vendorName, vendor_address: getAddress(vendorAddress).toLowerCase(), amount: amount.toString(), memo, due_date: dueDate, status: 'open', created_at: now, reminders: 0, ...(externalId ? { external_id: externalId } : {}), ...(body.webhookUrl ? { webhook_url: validWebhookUrl(body.webhookUrl, options.allowPrivateWebhooks) } : {}) };
 vault.invoices.push(invoice);
 return { invoice, created: true };
}
export function remindInvoice(vault: Vault, vaultId: string, invoiceId: string, now = new Date()) {
 const invoice = vault.invoices.find(i => i.id === invoiceId && i.group_id === vaultId);
 if (!invoice) fail('Unknown invoice.');
 if (invoice!.status !== 'open') fail('This invoice is already paid.');
 if (invoice!.last_reminded_at && now.getTime() - Date.parse(invoice!.last_reminded_at) < 3600_000) fail('A reminder was sent less than an hour ago.');
 invoice!.reminders += 1; invoice!.last_reminded_at = now.toISOString();
 return invoice!;
}
export const isOverdue = (invoice: Pick<Invoice, 'status' | 'due_date'>, now = new Date()) => invoice.status === 'open' && Date.parse(invoice.due_date + 'T23:59:59Z') < now.getTime();
export function invoiceView(vault: Vault, invoice: Invoice) {
 const group = vault.groups.find(g => g.id === invoice.group_id)!;
 const proposal = vault.proposals.find(p => p.id === invoice.proposal_id);
 return {
  id: invoice.id, externalId: invoice.external_id ?? null, vault: { name: group.name, address: group.safe!.address }, vendorName: invoice.vendor_name, vendorAddress: invoice.vendor_address,
  amount: formatUsdt(invoice.amount), asset: 'USDT', memo: invoice.memo, dueDate: invoice.due_date, status: invoice.status, overdue: isOverdue(invoice), reminders: invoice.reminders, createdAt: invoice.created_at,
  payment: invoice.paid_tx_hash ? { txHash: invoice.paid_tx_hash, explorerUrl: explorerTx(invoice.paid_tx_hash), paidAt: invoice.paid_at, approvals: proposal?.approver_ids?.length ?? 0, sessionId: proposal?.session_id ?? null } : null,
 };
}

const csvCell = (value: unknown) => { const text = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
/** Accountant export for one vault: every proposal, its invoice and on-chain proof. */
export function treasuryCsv(vault: Vault, vaultId: string) {
 const group = whitechainVault(vault, vaultId);
 const name = (id: string) => vault.wallets.find(w => w.id === id)?.name ?? id;
 const rows = vault.proposals.filter(p => p.group_id === group.id).map(p => {
  const invoice = vault.invoices.find(i => i.id === p.invoice_id);
  return [p.created_at, p.executed_at ?? '', p.id, p.status, formatUsdt(p.amount), 'USDT', p.to, p.note, invoice?.id ?? '', invoice?.vendor_name ?? '', invoice?.external_id ?? '', invoice?.due_date ?? '', name(p.proposer_id), (p.approver_ids ?? []).map(name).join('; '), p.gas_refund ? formatUsdt(p.gas_refund) : '', p.tx_hash ?? '', p.tx_hash ? explorerTx(p.tx_hash) : ''];
 });
 const header = ['proposed_at', 'executed_at', 'proposal_id', 'status', 'amount', 'asset', 'recipient', 'note', 'invoice_id', 'vendor', 'vendor_reference', 'due_date', 'proposed_by', 'co_present_approvers', 'network_fee_usdt', 'tx_hash', 'explorer_url'];
 return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
