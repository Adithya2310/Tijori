'use client';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ObjectIdentityForm from './ObjectIdentityForm.tsx';
import FlowPanel from './FlowPanel.tsx';
import JourneyIntro from './JourneyIntro.tsx';
import { BrandMark } from './Brand.tsx';
import { useTijori } from '../context.tsx';

export type AuthAlternative = { label: string; backLabel?: string; render: () => ReactNode };
export type TijoriAuthProps = {
 name?: string;
 /** Another sign-in path in the login step, e.g. older passphrase identities. */
 alternative?: AuthAlternative;
 footer?: ReactNode;
 headline?: ReactNode;
 tagline?: ReactNode;
 /** Open straight into sign-up or log-in (e.g. on /signup and /login). Default: a welcome choice. */
 mode?: 'signup' | 'login';
 /** Decorative layer behind the card (e.g. an animated background). Never required for any action. */
 backdrop?: ReactNode;
 /** Where the brand mark links (e.g. a landing page). */
 homeHref?: string;
};
/**
 * Sign-up and sign-in with a personal object (camera + on-device DINOv2), as a guided journey: a welcome choice,
 * then one step at a time. `alternative` adds another sign-in path to the log-in step.
 */
export function TijoriAuth({ name = 'Tijori', alternative, footer, headline, tagline, mode: requested, backdrop, homeHref }: TijoriAuthProps) {
 const { initialAuthMode, busy, error, setError, submitObjectIdentity } = useTijori();
 const [started, setStarted] = useState(!!requested), [chosen, setChosen] = useState<'signup' | 'login' | null>(requested ?? null);
 const [objectMode, setObjectMode] = useState(true), [identityBusy, setIdentityBusy] = useState(false);
 const mode = chosen ?? initialAuthMode, authBusy = busy || identityBusy;
 const start = (next: 'signup' | 'login') => { setChosen(next); setObjectMode(true); setError(''); setStarted(true); };
 const toWelcome = () => { setStarted(false); setError(''); };
 return <main className="tj-auth-shell tj-journey-shell">
  {backdrop}
  <div className="tj-auth-brand"><BrandMark name={name} href={homeHref} /><span className="tj-auth-return-note">A LITTLE SPACE FOR YOUR PEOPLE</span></div>
  <div className="tj-auth-layout tj-journey-layout"><div className="tj-auth-intro tj-journey-card">
   <JourneyIntro active={started}>
    <div className="tj-journey-heading"><div className="tj-eyebrow"><span className="tj-sparkle">✳</span> A LITTLE MORE TOGETHER</div><h1>{headline ?? <>What matters,<br /><em>held together.</em></>}</h1><p>{tagline ?? 'A shared space for your people and the things you protect together.'}</p></div>
    <div className="tj-journey-body">
     {!started ? <FlowPanel step="welcome" focus={false} direction={-1} animate={false}>
      <div className="tj-entry-heading"><h2>Make yourself at home.</h2><p>New here or picking up where you left off?</p></div>
      <div className="tj-entry-actions"><button className="tj-entry-primary" onClick={() => start('signup')}>Sign up <ArrowRight size={17} /></button><button className="tj-entry-secondary" onClick={() => start('login')}>Log in <ArrowRight size={17} /></button></div>
      <p className="tj-entry-preview">A username, an everyday object, and you’re ready.</p>
     </FlowPanel> : <div className="tj-auth-card tj-auth-form tj-journey-form">
      {objectMode || mode !== 'login' || !alternative
       ? <ObjectIdentityForm key={mode} mode={mode} busy={authBusy} onWorking={setIdentityBusy} onSubmit={(body, recovery) => submitObjectIdentity(mode, body, recovery)} onBack={toWelcome} />
       : <FlowPanel step="alternative"><div className="tj-flow-content"><div className="tj-flow-navigation"><button className="tj-flow-back" disabled={authBusy} onClick={() => { setObjectMode(true); setError(''); }}><ArrowLeft size={15} /> {alternative.backLabel ?? 'Back'}</button><span>LOG IN</span></div>{alternative.render()}</div></FlowPanel>}
      {mode === 'login' && alternative && objectMode && <button className="tj-legacy-login-link" disabled={authBusy} onClick={() => { setObjectMode(false); setError(''); }}>{alternative.label}</button>}
      {error && <div className="tj-error" role="alert">{error}</div>}
     </div>}
     {!started && error && <div className="tj-error" role="alert">{error}</div>}
    </div>
   </JourneyIntro>
  </div></div>
  <div className="tj-auth-bottom">{footer ?? <>{name.toUpperCase()} &nbsp; · &nbsp; BUILT FOR TOGETHER</>}</div>
 </main>;
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
