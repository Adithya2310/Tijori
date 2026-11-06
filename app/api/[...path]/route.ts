import { NextRequest, NextResponse } from 'next/server';
import { StorageError } from '@/lib/db';
import { VaultError } from '@/lib/vault';
import { IntegrationUnavailableError } from '@/lib/integrations/contracts';
import { balance, capabilities, mutate, prepareDeployment, queryWorkflow, readState, readObjectIdentities, verifyExternalApproval } from '@/lib/api/service';
import { approveInSession, AuthError, createWhitechainVault, issueInboxKey, listApprovalSessions, proposePayout, relayerStatus, startApprovalSession, treasuryExport, vendorCreateInvoice, vendorGetInvoice, vendorRemind } from '@/lib/api/treasury';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(e: unknown) {
 const known = e instanceof StorageError || e instanceof VaultError || e instanceof IntegrationUnavailableError || e instanceof AuthError;
 return json({ error: known ? e.message : 'Could not process this request.' }, e instanceof AuthError ? 401 : e instanceof IntegrationUnavailableError ? 501 : e instanceof StorageError ? 503 : 400);
}
const actions: Record<string, string> = {
 'identities': 'signup', 'identities/login': 'login', 'groups': 'groups',
 'transactions': 'transactions', 'physical-approvals': 'approve', 'vaults/register-safe': 'register-safe',
};
function route(path: string[]) {
 const versioned = path[0] === 'v1';
 return { versioned, path: (versioned ? path.slice(1) : path).join('/') };
}
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 try {
  const { path, versioned } = route((await ctx.params).path);
  if (versioned && path === 'capabilities') return json(capabilities());
  if (path === 'object-identities') return json(await readObjectIdentities());
  const query = req.nextUrl.searchParams;
  if (versioned && path === 'treasury/sessions') return json(await listApprovalSessions(query.get('identityId') || ''));
  if (versioned && path === 'relayer') return json(await relayerStatus());
  if (versioned && path === 'invoices') return json(await vendorGetInvoice(req.headers.get('authorization'), query.get('id')));
  if (versioned && path === 'treasury/export') {
   const { csv, filename } = await treasuryExport(query.get('vaultId'), query.get('identityId'));
   return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  }
  if (path === 'state') return json(await readState(req.nextUrl.searchParams.get('identityId') || undefined, versioned));
  if (path === 'balance') return json(await balance(req.nextUrl.searchParams.get('vaultId')));
  throw new VaultError('Unknown action.');
 } catch (e) { return failure(e); }
}
async function readBody(req: NextRequest, limit: number): Promise<Record<string, unknown>> {
 const origin = req.headers.get('origin');
 // Keep the unauthenticated paid-write demo local. CORS is not authentication.
 if (origin && origin !== `${req.nextUrl.protocol}//${req.headers.get('host')}`) throw new VaultError('Cross-origin writes are not allowed.');
 if (Number(req.headers.get('content-length') || 0) > limit) throw new VaultError('Request is too large.');
 const reader = req.body?.getReader();
 if (!reader) throw new VaultError('Request body is required.');
 let size = 0; const chunks: Uint8Array[] = [];
 while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new VaultError('Request is too large.'); } chunks.push(value); }
 const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VaultError('Expected a request object.');
 // Block accidental sensitive payloads even before teammates implement providers.
 function check(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
   if (/^(passphrase|confirmPassphrase|privateKey|image|objectImage)$/i.test(key)) throw new VaultError('Do not send passphrases, plaintext private keys or images to this API.');
   check(child);
  }
 }
 check(body);
 return body;
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 try {
  const { path, versioned } = route((await ctx.params).path);
  const limit=path==='signup'||(versioned&&path==='identities')?32768:16384;
  const body = await readBody(req,limit);
  if (versioned) {
   if (path === 'objects/verify') return json(await queryWorkflow('verify-object', body));
   if (path === 'physical-approvals/discover') return json(await queryWorkflow('discover', body));
   if (path === 'vaults/prepare') return json(await prepareDeployment(body));
   if (path === 'vaults/verify-approval') return json(await verifyExternalApproval(body));
   // Whitechain treasury: gasless guarded vaults, co-present approval sessions, vendor invoice inbox.
   const idempotencyKey = req.headers.get('idempotency-key');
   if (path === 'vaults/whitechain') return json(await createWhitechainVault(body, idempotencyKey));
   if (path === 'proposals') return json(await proposePayout(body, idempotencyKey));
   if (path === 'approval-sessions') return json(await startApprovalSession(body));
   if (path === 'physical-approvals' && body.sessionId !== undefined) return json(await approveInSession(body));
   if (path === 'vaults/inbox-key') return json(await issueInboxKey(body));
   if (path === 'invoices') return json(await vendorCreateInvoice(req.headers.get('authorization'), body));
   if (path === 'invoices/remind') return json(await vendorRemind(req.headers.get('authorization'), body));
  }
  const action = versioned ? actions[path] : path;
  if (!['signup', 'login', 'groups', 'transactions', 'approve', 'register-safe'].includes(action)) throw new VaultError('Unknown action.');
  return json(await mutate(action, body, req.headers.get('idempotency-key'), versioned));
 } catch (e) { return failure(e); }
}
