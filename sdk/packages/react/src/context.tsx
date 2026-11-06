'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
 configureAssets, createTijoriClient, listDeviceIdentities, listServerIdentities, setSessionSigner, unlockObjectIdentityAccount,
 type ApplicationState, type MutationAction, type ObjectRecovery, type TijoriClient,
} from '@tijori/client';
import { unlockIdentityAccount, type KeyEnvelope } from '@tijori/core/identity-key';
import type { ObjectProfile } from '@tijori/core/object-profile';

// Session keys are persisted in existing browsers; keep their values (see @tijori/core/legacy).
const SESSION_KEY = 'pv-session', OPERATION_KEY = 'pv-operation', PENDING_IDENTITY_KEY = 'pv-pending-identity';

export type TijoriTheme = Partial<Record<'ink' | 'muted' | 'accent' | 'line' | 'background' | 'font' | 'fontDisplay', string>>;
/** Ultrasonic presence integration: resolve with the room code heard for a challenge. */
export type PresenceListener = { listen(challengeId: string): Promise<string> };
export type PresenceEmit = { challengeId: string; code: string; expiresAt: string };
export type ObjectIdentityBody = { name?: string; address: string; objectName: string; keyEnvelope?: KeyEnvelope; objectProfile?: ObjectProfile };
export type TijoriIdentity = ApplicationState['wallets'][number];

export type TijoriProviderProps = {
 children: ReactNode;
 /** URL of your @tijori/server /v1 API. Default '/api/v1'. Ignored when `client` is given. */
 baseUrl?: string;
 client?: TijoriClient;
 /** Where the model assets are served (see `tijori-client prepare-assets`). Default '/tijori-assets/'. */
 assetBaseUrl?: string;
 theme?: TijoriTheme;
 className?: string;
 /** Link for a paid invoice's public receipt. Default `/invoice/<id>`. */
 receiptUrl?: (invoiceId: string) => string;
 /** Real ultrasonic listener for approval sessions. Defaults to window.tijoriPresence when present. */
 presence?: PresenceListener;
 /** Called when this device starts an approval session and must broadcast the room code. */
 onPresenceEmit?: (emit: PresenceEmit) => void;
 /** State refresh interval while signed in. Defaults: 2.5 s in local storage mode, 5 s otherwise. */
 pollIntervalMs?: number;
};

export type TijoriContextValue = {
 client: TijoriClient;
 data: ApplicationState;
 /** The signed-in identity, if any. */
 identity: TijoriIdentity | undefined;
 identityId: string;
 loaded: boolean;
 /** Suggested first auth tab: 'login' when this browser or server already knows an identity. */
 initialAuthMode: 'signup' | 'login';
 localStorageMode: boolean;
 busy: boolean;
 error: string;
 notice: string;
 setError(message: string): void;
 setNotice(message: string): void;
 setData(state: ApplicationState): void;
 refresh(): Promise<boolean>;
 /** Idempotent mutation with retry-safe operation IDs. Returns false (and sets `error`) on failure. */
 mutate(action: MutationAction, body: object, message: string, unlock?: { recovery?: ObjectRecovery; passphrase?: string }): Promise<boolean>;
 /** Submit an object sign-up or sign-in produced by <ObjectIdentityForm>. */
 submitObjectIdentity(mode: 'signup' | 'login', body: ObjectIdentityBody, recovery: ObjectRecovery): Promise<boolean>;
 /** Run work with `busy` set and errors captured into `error`. */
 run(work: () => Promise<void>): Promise<boolean>;
 signOut(): void;
 /** Pause background state polling while a view polls on its own (returns a resume function). */
 pausePolling(): () => void;
 receiptUrl: (invoiceId: string) => string;
 presence?: PresenceListener;
 onPresenceEmit?: (emit: PresenceEmit) => void;
};

const empty: ApplicationState = { wallets: [], groups: [], transactions: [], proposals: [], invoices: [] };
const TijoriContext = createContext<TijoriContextValue | null>(null);
const session = {
 get: (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } },
 set: (key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch { /* storage disabled */ } },
 remove: (key: string) => { try { sessionStorage.removeItem(key); } catch { /* storage disabled */ } },
};
async function fingerprintOf(action: string, body: object) {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
 return action + ':' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Provides the Tijori client, signed-in identity and shared state to every Tijori component. */
export function TijoriProvider({ children, baseUrl, client: given, assetBaseUrl, theme, className, receiptUrl, presence, onPresenceEmit, pollIntervalMs }: TijoriProviderProps) {
 const client = useMemo(() => given ?? createTijoriClient({ baseUrl }), [given, baseUrl]);
 if (assetBaseUrl) configureAssets({ assetBaseUrl });
 const [data, setData] = useState<ApplicationState>(empty), [identityId, setIdentityId] = useState(''), [loaded, setLoaded] = useState(false);
 const [initialAuthMode, setInitialAuthMode] = useState<'signup' | 'login'>('signup');
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 const [pauses, setPauses] = useState(0);
 const stateRequest = useRef(0);
 const localStorageMode = data.storageMode === 'local';

 useEffect(() => {
  let live = true;
  const remembered = session.get(SESSION_KEY) || '';
  client.state(remembered || undefined).then(async result => {
   if (!live) return;
   setData(result); setIdentityId(remembered);
   try {
    const known = [...await listDeviceIdentities(), ...await listServerIdentities(client)];
    if (live && known.some(item => item.status === 'registered') && !known.some(item => item.status === 'pending')) setInitialAuthMode('login');
   } catch { /* no saved identities */ }
   if (live) setLoaded(true);
  }).catch(() => { if (live) { setError('Could not load storage. Check the server configuration and reload.'); setLoaded(true); } });
  return () => { live = false; };
 }, [client]);

 // Discover enrolled peers and new groups without overlapping requests. Polling never writes.
 useEffect(() => {
  if (!identityId || busy || pauses > 0) return;
  let disposed = false, timer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const every = pollIntervalMs ?? (localStorageMode ? 2500 : 5000);
  async function poll() {
   const version = stateRequest.current;
   try { const result = await client.state(identityId); if (!disposed && !controller.signal.aborted && version === stateRequest.current) setData(result); }
   catch { /* transient */ }
   finally { if (!disposed) timer = setTimeout(poll, every); }
  }
  void poll();
  return () => { disposed = true; controller.abort(); clearTimeout(timer); };
 }, [client, identityId, busy, pauses, localStorageMode, pollIntervalMs]);

 const refresh = useCallback(async () => {
  const request = ++stateRequest.current; setBusy(true); setError('');
  try { const result = await client.state(identityId || undefined); if (request !== stateRequest.current) return false; setData(result); return true; }
  catch (e) { if (request === stateRequest.current) setError(e instanceof Error ? e.message : 'Could not refresh the vault.'); return false; }
  finally { if (request === stateRequest.current) setBusy(false); }
 }, [client, identityId]);

 const mutate = useCallback<TijoriContextValue['mutate']>(async (action, body, message, unlock = {}) => {
  ++stateRequest.current; setBusy(true); setError('');
  try {
   // Reuse the operation ID for an identical retry, so an uncertain write is never applied twice.
   const fingerprint = await fingerprintOf(action, body);
   let operation: { fingerprint: string; id: string } | null = null;
   try { operation = JSON.parse(session.get(OPERATION_KEY) || 'null'); } catch { /* replaced below */ }
   if (operation?.fingerprint !== fingerprint || typeof operation?.id !== 'string') operation = { fingerprint, id: crypto.randomUUID() };
   session.set(OPERATION_KEY, JSON.stringify(operation));
   const result = await client.mutate(action, body, operation.id);
   // The unlocked identity key signs Whitechain approvals. It stays in this tab's memory only.
   if (action === 'login') {
    if (unlock.recovery) setSessionSigner(await unlockObjectIdentityAccount(unlock.recovery, result.keyEnvelope as KeyEnvelope));
    else if (unlock.passphrase !== undefined) setSessionSigner(await unlockIdentityAccount((body as { address: string }).address, result.keyEnvelope as KeyEnvelope, unlock.passphrase));
   } else if (action === 'signup' && unlock.recovery) setSessionSigner(await unlockObjectIdentityAccount(unlock.recovery, unlock.recovery.keyEnvelope));
   if (action === 'signup') session.remove(PENDING_IDENTITY_KEY);
   session.remove(OPERATION_KEY); setData(result);
   if (result.identityId) { setIdentityId(result.identityId); session.set(SESSION_KEY, result.identityId); }
   setNotice(message);
   return true;
  } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); return false; }
  finally { setBusy(false); }
 }, [client]);

 const submitObjectIdentity = useCallback<TijoriContextValue['submitObjectIdentity']>(async (mode, body, recovery) => {
  if (mode === 'signup') {
   try {
    const stored = session.get(PENDING_IDENTITY_KEY), pending = stored ? JSON.parse(stored) : null;
    if (pending && JSON.stringify(pending) !== JSON.stringify(body)) throw Error('A signup is awaiting confirmation. Resume its remembered identity and original name, or restore its backup before retrying.');
    session.set(PENDING_IDENTITY_KEY, JSON.stringify(body));
   } catch (e) { setError(e instanceof Error ? e.message : 'Could not preserve the pending signup.'); return false; }
  }
  return mutate(mode, body, mode === 'signup' ? 'Identity created. This browser remembers your object.' : 'Object matched. Welcome back.', { recovery });
 }, [mutate]);

 const run = useCallback(async (work: () => Promise<void>) => {
  ++stateRequest.current; setBusy(true); setError('');
  try { await work(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); return false; } finally { setBusy(false); }
 }, []);

 const signOut = useCallback(() => {
  setSessionSigner(null); session.remove(SESSION_KEY); setIdentityId(''); setError(''); setNotice(''); setInitialAuthMode('login');
 }, []);
 const pausePolling = useCallback(() => { setPauses(n => n + 1); let resumed = false; return () => { if (!resumed) { resumed = true; setPauses(n => n - 1); } }; }, []);

 const value: TijoriContextValue = {
  client, data, identity: data.wallets.find(w => w.id === identityId), identityId, loaded, initialAuthMode, localStorageMode,
  busy, error, notice, setError, setNotice, setData, refresh, mutate, submitObjectIdentity, run, signOut, pausePolling,
  receiptUrl: receiptUrl ?? (id => `/invoice/${id}`), presence, onPresenceEmit,
 };
 const style: Record<string, string> = {};
 if (theme?.ink) style['--tj-ink'] = theme.ink;
 if (theme?.muted) style['--tj-muted'] = theme.muted;
 if (theme?.accent) { style['--tj-accent'] = theme.accent; style['--tj-accent-hover'] = theme.accent; style['--tj-green'] = theme.accent; }
 if (theme?.line) style['--tj-line'] = theme.line;
 if (theme?.background) style['--tj-bg'] = theme.background;
 if (theme?.font) style['--tj-font'] = theme.font;
 if (theme?.fontDisplay) style['--tj-font-display'] = theme.fontDisplay;
 return <TijoriContext.Provider value={value}><div className={'tj-root' + (className ? ' ' + className : '')} style={style as CSSProperties}>{children}</div></TijoriContext.Provider>;
}

/** Access the Tijori client, identity and state. Must be used inside <TijoriProvider>. */
export function useTijori(): TijoriContextValue {
 const value = useContext(TijoriContext);
 if (!value) throw new Error('Tijori components must be rendered inside <TijoriProvider>.');
 return value;
}
/** The signed-in identity and sign-out. */
export function useIdentity() {
 const { identity, identityId, signOut, loaded } = useTijori();
 return { identity, identityId, signedIn: !!identity, loaded, signOut };
}
/** Vaults (groups) visible to the signed-in identity, with server-computed approval rules. */
export function useVaults() {
 const { data } = useTijori();
 return data.groups;
}
