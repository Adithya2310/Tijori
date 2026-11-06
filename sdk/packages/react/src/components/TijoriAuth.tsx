'use client';
import { useState, type ReactNode } from 'react';
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react';
import ObjectIdentityForm from './ObjectIdentityForm.tsx';
import { useTijori } from '../context.tsx';

export type AuthAlternative = { label: string; backLabel?: string; render: () => ReactNode };
/**
 * Sign-up and sign-in with a personal object (camera + on-device DINOv2). `alternative` adds another sign-in path
 * to the login tab, e.g. the reference app's legacy passphrase identities.
 */
export function TijoriAuth({ name = 'Tijori', alternative, footer, headline, tagline }: { name?: string; alternative?: AuthAlternative; footer?: ReactNode; headline?: ReactNode; tagline?: ReactNode }) {
 const { initialAuthMode, localStorageMode, busy, error, setError, submitObjectIdentity } = useTijori();
 const [chosen, setChosen] = useState<'signup' | 'login' | null>(null), [objectMode, setObjectMode] = useState(true), [identityBusy, setIdentityBusy] = useState(false);
 const mode = chosen ?? initialAuthMode, authBusy = busy || identityBusy;
 const select = (next: 'signup' | 'login') => { setChosen(next); setObjectMode(true); setError(''); };
 return <main className="tj-auth-shell"><div className="tj-auth-brand"><div className="tj-brand-mark"><LockKeyhole size={18} /></div><span>{name}<span className="tj-brand-dot">.</span></span></div>
  <div className="tj-auth-layout"><div className="tj-auth-intro"><div className="tj-eyebrow"><span className="tj-sparkle">✳</span> A MORE HUMAN WAY TO SECURE</div>
   <h1>{headline ?? <>What matters,<br /><em>held together.</em></>}</h1><p>{tagline ?? 'A shared space for your people and the things you protect together.'}</p>
   <div className="tj-auth-art"><div className="tj-auth-art-ring"><div><Fingerprint size={62} strokeWidth={1.2} /></div></div><span><ShieldCheck size={16} /> TRUST IS A TEAM EFFORT</span></div></div>
   <div className="tj-auth-card"><div className="tj-auth-card-top"><span className="tj-demo-pill"><span /> {localStorageMode ? 'LOCAL WI-FI TEST' : 'ARKIV DEMO'}</span><span>YOUR PRIVATE SPACE</span></div>
    <h2>Welcome to {name}</h2><p>{mode === 'signup' ? 'Create your identity with a personal object.' : 'Show your object to return to your identity.'}</p>
    <div className="tj-auth-tabs" role="tablist"><button disabled={authBusy} role="tab" aria-selected={mode === 'signup'} onClick={() => select('signup')}>Sign up</button><button disabled={authBusy} role="tab" aria-selected={mode === 'login'} onClick={() => select('login')}>Log in</button></div>
    <div className="tj-auth-form">
     {localStorageMode && <p className="tj-notice">Local Wi-Fi test: identities and groups are saved on this laptop. Photos and DINOv2 features stay on your device. Arkiv is not used.</p>}
     {mode === 'login' && alternative && <button className="tj-light-btn" disabled={authBusy} onClick={() => { setObjectMode(!objectMode); setError(''); }}>{objectMode ? alternative.label : alternative.backLabel ?? 'Use remembered object identity'}</button>}
     {objectMode || mode !== 'login' || !alternative ? <ObjectIdentityForm key={mode} mode={mode} busy={authBusy} onWorking={setIdentityBusy} onSubmit={(body, recovery) => submitObjectIdentity(mode, body, recovery)} /> : alternative.render()}
     {error && <div className="tj-error" role="alert">{error}</div>}
     <p className="tj-auth-footnote"><LockKeyhole size={13} /> Demo only · Please don’t use real credentials or funds</p>
    </div></div></div>
  <div className="tj-auth-bottom">{footer ?? <>{name.toUpperCase()} &nbsp; · &nbsp; BUILT FOR TOGETHER</>}</div></main>;
}
/** Sign-up only. */
export const ObjectSignUp = (props: { onSubmitted?: () => void }) => <ObjectIdentityStep mode="signup" {...props} />;
/** Sign-in only. */
export const ObjectSignIn = (props: { onSubmitted?: () => void }) => <ObjectIdentityStep mode="login" {...props} />;
function ObjectIdentityStep({ mode, onSubmitted }: { mode: 'signup' | 'login'; onSubmitted?: () => void }) {
 const { busy, error, submitObjectIdentity } = useTijori();
 const [working, setWorking] = useState(false);
 return <div className="tj-auth-form"><ObjectIdentityForm mode={mode} busy={busy || working} onWorking={setWorking} onSubmit={async (body, recovery) => { const ok = await submitObjectIdentity(mode, body, recovery); if (ok) onSubmitted?.(); return ok; }} />{error && <div className="tj-error" role="alert">{error}</div>}</div>;
}
