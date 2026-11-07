'use client';
import { createContext, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createTijoriClient } from '@tijori/client';
import { TijoriProvider } from '@tijori/react';
import { privateVaultClient } from '../../lib/private-vault-client';
import { VAULT_USDT } from '../../lib/anon-vault-protocol';

type Adapter = ReturnType<typeof privateVaultClient>;
const Reads = createContext<{ adapter: Adapter; retry: () => void } | null>(null);

export function PrivateVaultProvider({ children, token = VAULT_USDT }: { children: ReactNode; token?: string }) {
 const [adapter] = useState(() => privateVaultClient(createTijoriClient({ baseUrl: '/api/v1' }), token));
 const [revision, retry] = useReducer(n => n + 1, 0);
 // A new client reference asks the SDK to rerun its existing refresh effect, preserving the selected vault.
 const client = useMemo(() => { void revision; return { ...adapter.client }; }, [adapter, revision]);
 useEffect(() => () => adapter.cancelAll(), [adapter]);
 return <Reads.Provider value={{ adapter, retry }}><TijoriProvider client={client} assetBaseUrl="/tijori-assets/">{children}</TijoriProvider></Reads.Provider>;
}

export function PrivateVaultStatus({ vaultId }: { vaultId: string }) {
 const reads = useContext(Reads);
 if (!reads) throw new Error('PrivateVaultStatus requires PrivateVaultProvider.');
 return <ReadStatus vaultId={vaultId} {...reads} />;
}

function ReadStatus({ vaultId, adapter, retry }: { vaultId: string; adapter: Adapter; retry: () => void }) {
 const state = useSyncExternalStore(adapter.subscribe, () => adapter.snapshot(vaultId), () => adapter.snapshot(vaultId));
 useEffect(() => () => adapter.cancel(vaultId), [adapter, vaultId]);
 const loading = state.phase === 'loading';
 return <section className="tj-vault-members" aria-label="Vault read privacy">
  <div className="tj-section-heading"><div><div className="tj-section-kicker">VAULT READ PRIVACY</div><h2>Anon RPC · Nym</h2></div>
   <button className="tj-light-btn" disabled={loading} onClick={retry}>{state.phase === 'error' ? 'Retry private read' : 'Refresh private read'}</button></div>
  <p className="tj-form-hint" role="status" aria-live="polite">{loading ? 'Connecting through Nym and reading your vault… This may take up to 90 seconds.' : state.phase === 'success' ? 'Vault balance and Safe configuration loaded via Anon RPC / Nym.' : state.phase === 'error' ? 'Private read unavailable. No direct fallback was used.' : 'Waiting for the private vault read.'}
   {state.updatedAt && <> {state.phase !== 'success' ? 'Previous values last loaded' : 'Last loaded'} at {new Date(state.updatedAt).toLocaleTimeString()}.</>}</p>
  {state.error && <p className="tj-error">{state.error}</p>}
  <p className="tj-form-hint">These blockchain reads use the Nym mixnet to reduce linking your vault query to your IP at the destination RPC. Public signer addresses and transactions remain visible. Login, approvals and payment execution use Tijori’s existing server connection. Worker bootstrap and bundle downloads use direct connections. This does not guarantee anonymity or personal safety.</p>
 </section>;
}
