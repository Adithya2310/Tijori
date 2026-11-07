import { withArkiv } from '@tijori/server/storage/arkiv';
import { storageMode } from '@tijori/server/storage/index';
import { tijori } from '@/lib/tijori';
import { verifyStorageReceipt } from '@/lib/storage-proof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only evidence for the encrypted aggregate containing the requested identity. */
export async function GET(request: Request) {
 const identityId = new URL(request.url).searchParams.get('identityId');
 const headers = { 'Cache-Control': 'no-store' };
 if (!identityId || identityId.length > 100) return Response.json({ error: 'Choose a registered identity.' }, { status: 400, headers });
 try {
  const proof = await tijori.run(async () => {
   if (storageMode() !== 'arkiv') return { persisted: false, storageMode: storageMode() };
   return withArkiv(async store => {
    const state = await store.read();
    if (!state.entityKey || !state.vault.wallets.some(wallet => wallet.id === identityId && wallet.keyEnvelope)) return { persisted: false, storageMode: 'arkiv' };
    const evidence = await verifyStorageReceipt(store, state.entityKey);
    // Only expose receipt metadata; no ciphertext, identity profiles, keys or signed journal bytes.
    return { persisted: true, storageMode: 'arkiv', ...evidence,
     entityKey: state.entityKey, revision: state.revision.toString() };
   });
  });
  return Response.json(proof, { headers });
 } catch {
  return Response.json({ error: 'Could not verify the Arkiv storage receipt. Try again.' }, { status: 503, headers });
 }
}
