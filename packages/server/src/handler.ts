// Framework-neutral HTTP surface: Request in, Response out. Mounted by the Next.js and Node adapters.
import { VaultError } from '@tijori/core/vault';
import { IntegrationUnavailableError } from '@tijori/core/integrations';
import { applyProximity, latestSession, proximityMember, sessionView } from '@tijori/core/proximity';
import { StorageError, withState } from './storage/index.ts';
import { balance, capabilities, mutate, prepareDeployment, queryWorkflow, readObjectIdentities, readState, verifyExternalApproval } from './services/service.ts';
import { approveInSession, AuthError, createWhitechainVault, invoiceReceipt, issueInboxKey, listApprovalSessions, proposePayout, relayerStatus, startApprovalSession, treasuryExport, vendorCreateInvoice, vendorGetInvoice, vendorRemind } from './services/treasury.ts';

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
export function failure(e: unknown) {
 const known = e instanceof StorageError || e instanceof VaultError || e instanceof IntegrationUnavailableError || e instanceof AuthError;
 return json({ error: known ? e.message : 'Could not process this request.' }, e instanceof AuthError ? 401 : e instanceof IntegrationUnavailableError ? 501 : e instanceof StorageError ? 503 : 400);
}
const actions: Record<string, string> = {
 'identities': 'signup', 'identities/login': 'login', 'groups': 'groups',
 'transactions': 'transactions', 'physical-approvals': 'approve', 'vaults/register-safe': 'register-safe',
};
/** Split the path after basePath into { versioned, path }, e.g. '/api/v1/state' with basePath '/api' → v1 'state'. */
export function routeOf(url: URL, basePath: string) {
 const base = basePath.replace(/\/+$/, '');
 let rest = url.pathname;
 if (base && rest.startsWith(base + '/')) rest = rest.slice(base.length);
 else if (base && rest !== base) return null;
 const segments = rest.split('/').filter(Boolean).map(decodeURIComponent);
 const versioned = segments[0] === 'v1';
 return { versioned, path: (versioned ? segments.slice(1) : segments).join('/') };
}
async function readJson(req: Request, limit: number, scanSensitive: boolean): Promise<Record<string, unknown>> {
 // Keep unauthenticated paid writes same-origin. CORS is not authentication.
 const origin = req.headers.get('origin');
 const url = new URL(req.url);
 if (origin && origin !== `${url.protocol}//${req.headers.get('host') ?? url.host}`) throw new VaultError('Cross-origin writes are not allowed.');
 if (Number(req.headers.get('content-length') || 0) > limit) throw new VaultError('Request is too large.');
 const reader = req.body?.getReader();
 if (!reader) throw new VaultError('Request body is required.');
 let size = 0; const chunks: Uint8Array[] = [];
 while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new VaultError('Request is too large.'); } chunks.push(value); }
 let body: unknown;
 try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new VaultError('Expected a JSON request body.'); }
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VaultError('Expected a request object.');
 // Block accidental sensitive payloads even before integrators implement providers.
 const check = (value: unknown): void => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
   if (/^(passphrase|confirmPassphrase|privateKey|image|objectImage)$/i.test(key)) throw new VaultError('Do not send passphrases, plaintext private keys or images to this API.');
   check(child);
  }
 };
 if (scanSensitive) check(body);
 return body as Record<string, unknown>;
}

export async function handle(req: Request, basePath: string): Promise<Response> {
 try {
  const url = new URL(req.url), route = routeOf(url, basePath);
  if (!route) return json({ error: 'Not found.' }, 404);
  const { path, versioned } = route, query = url.searchParams;
  if (req.method === 'GET' || req.method === 'HEAD') {
   if (versioned && path === 'capabilities') return json(capabilities());
   if (path === 'object-identities') return json(await readObjectIdentities());
   if (path === 'proximity') {
    const groupId = query.get('groupId')?.trim() ?? '', walletId = query.get('walletId')?.trim() ?? '';
    return await withState(async store => { const { vault } = await store.read(); proximityMember(vault, groupId, walletId); return json({ session: sessionView(latestSession(vault, groupId)) }); });
   }
   if (versioned && path === 'treasury/sessions') return json(await listApprovalSessions(query.get('identityId') || ''));
   if (versioned && path === 'relayer') return json(await relayerStatus());
   if (versioned && path === 'invoices/receipt') {
    const receipt = await invoiceReceipt(query.get('id') ?? '');
    return receipt ? json({ invoice: receipt }) : json({ error: 'Unknown invoice.' }, 404);
   }
   if (versioned && path === 'invoices') return json(await vendorGetInvoice(req.headers.get('authorization'), query.get('id')));
   if (versioned && path === 'treasury/export') {
    const { csv, filename } = await treasuryExport(query.get('vaultId'), query.get('identityId'));
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, ...NO_STORE } });
   }
   if (path === 'state') return json(await readState(query.get('identityId') || undefined, versioned));
   if (path === 'balance') return json(await balance(query.get('vaultId')));
   throw new VaultError('Unknown action.');
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (path === 'proximity') {
   const body = await readJson(req, 2048, false);
   const operationId = req.headers.get('idempotency-key') || globalThis.crypto.randomUUID();
   if (!/^[\w-]{1,100}$/.test(operationId)) throw new VaultError('Invalid operation ID.');
   return await withState(async store => {
    const previous = await store.read();
    const { changed, ...result } = applyProximity(previous.vault, body, operationId);
    if (changed) await store.write(previous.vault, previous);
    return json(result);
   });
  }
  const body = await readJson(req, path === 'signup' || (versioned && path === 'identities') ? 32768 : 16384, true);
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
