import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { withArkiv, StorageError } from '@/lib/db';
import { VaultError } from '@/lib/vault';
import { applyProximity, latestSession, proximityMember, sessionView } from '@/lib/proximity';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = (e: unknown) => json({ error: e instanceof StorageError || e instanceof VaultError ? e.message : 'Unable to process the acoustic check.' }, e instanceof StorageError ? 503 : 400);
export async function GET(req: NextRequest) {
 try {
  const groupId = text(req.nextUrl.searchParams.get('groupId')), walletId = text(req.nextUrl.searchParams.get('walletId'));
  return await withArkiv(async store => {
   const { vault } = await store.read();
   proximityMember(vault, groupId, walletId);
   return json({ session: sessionView(latestSession(vault, groupId)) });
  });
 } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
 try {
  const origin = req.headers.get('origin');
  if (origin && origin !== `${req.nextUrl.protocol}//${req.headers.get('host')}`) throw new VaultError('Cross-origin writes are not allowed.');
  // Bound streamed input as well as Content-Length before touching paid storage.
  const reader = req.body?.getReader();
  if (!reader) throw new VaultError('Request body is required.');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); throw new VaultError('Request is too large.'); } chunks.push(value); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VaultError('Expected a request object.');
  const operationId = req.headers.get('idempotency-key') || randomUUID();
  if (!/^[\w-]{1,100}$/.test(operationId)) throw new VaultError('Invalid operation ID.');
  return await withArkiv(async store => {
   const previous = await store.read();
   const { changed, ...result } = applyProximity(previous.vault, body, operationId);
   if (changed) await store.write(previous.vault, previous);
   return json(result);
  });
 } catch (e) { return failure(e); }
}
