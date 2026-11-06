import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { withArkiv, StorageError } from '@/lib/db';
import { applyAction, publicState, VaultError } from '@/lib/vault';
import { verifySafeDeployment, readSafeStatus } from '@/lib/safe';
import { formatEther } from 'viem';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(e: unknown) {
 return json({ error: e instanceof StorageError || e instanceof VaultError ? e.message : 'Could not process this request.' }, e instanceof StorageError ? 503 : 400);
}
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 try {
  const action = (await ctx.params).path.join('/');
  if (action === 'state') return await withArkiv(async store => json(publicState((await store.read()).vault)));
  if (action === 'balance') {
   const id = req.nextUrl.searchParams.get('vaultId');
   const safe = await withArkiv(async store => (await store.read()).vault.groups.find(g => g.id === id)?.safe);
   if (!safe) throw new VaultError('This vault has no deployed Safe.');
   try { const status = await readSafeStatus(safe.address); return json({ ...status, balanceEth: formatEther(BigInt(status.balanceWei)) }); }
   catch { throw new StorageError('Could not read the Safe on Base Sepolia.'); }
  }
  throw new VaultError('Unknown action.');
 }
 catch (e) { return failure(e); }
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 try {
  // This remains a local demo. Reject cross-origin requests before paid storage writes.
  const origin = req.headers.get('origin');
  // Next.js may normalize nextUrl.hostname to localhost for loopback requests.
  // Compare against the actual browser-facing Host, without trusting forwarded headers.
  if (origin && origin !== `${req.nextUrl.protocol}//${req.headers.get('host')}`) throw new VaultError('Cross-origin writes are not allowed.');
  const { path } = await ctx.params, action = path.join('/');
  if (!['signup', 'login', 'groups', 'transactions', 'approve', 'register-safe'].includes(action)) throw new VaultError('Unknown action.');
  if (Number(req.headers.get('content-length') || 0) > 16384) throw new VaultError('Request is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new VaultError('Request body is required.');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); throw new VaultError('Request is too large.'); } chunks.push(value); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VaultError('Expected a request object.');
  const id = req.headers.get('idempotency-key') || randomUUID();
  if (!/^[\w-]{1,100}$/.test(id)) throw new VaultError('Invalid operation ID.');
  const digest = createHash('sha256').update(JSON.stringify([action, body])).digest('hex');
  return await withArkiv(async store => {
   const previous = await store.read(), vault = previous.vault;
   const saved = vault.operations.find(o => o.id === id);
   if (saved && saved.digest !== digest) throw new VaultError('This operation ID was already used with different input.');
   let actionBody = body;
   if (!saved && action === 'register-safe') {
    try { actionBody = { ...body, safe: await verifySafeDeployment(body) }; }
    catch { throw new VaultError('Could not verify the Safe deployment on Base Sepolia. Check the deployment and try again.'); }
   }
   const identityId = saved ? saved.identityId : applyAction(vault, action, actionBody);
   if (!saved && action !== 'login') {
    vault.operations.push({ id, digest, ...(identityId ? { identityId } : {}) });
    vault.operations = vault.operations.slice(-100);
    await store.write(vault, previous);
   }
   return json({ ...publicState(vault), ...(identityId ? { identityId } : {}), ...(action === 'login' && identityId ? { keyEnvelope: vault.wallets.find(w => w.id === identityId)?.keyEnvelope } : {}) });
  });
 } catch (e) { return failure(e); }
}
