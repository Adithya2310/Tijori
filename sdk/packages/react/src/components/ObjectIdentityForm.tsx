'use client';
import { useEffect, useId, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, UserRound } from 'lucide-react';
import { OBJECT_IDENTITY_NAME, packObjectProfileV2, packObjectQuery, packObjectView, type ObjectProfileV2, type ObjectQuery } from '@tijori/core/object-profile';
import { createObjectIdentityV2, downloadObjectRecovery, listDeviceIdentities, listObjectUsernames, preloadObjectModels, saveDeviceIdentity, type ObjectRecoveryV2, type ObjectScanResult } from '@tijori/client';
import type { KeyEnvelope } from '@tijori/core/identity-key';
import ObjectCapture from './ObjectCapture.tsx';
import FlowPanel from './FlowPanel.tsx';
import { useTijori } from '../context.tsx';

export type ObjectSignUpBody = { name: string; address: string; objectName: string; keyEnvelope: KeyEnvelope; objectProfile: ObjectProfileV2 };
export type ObjectLoginBody = { username: string; objectQuery: ObjectQuery };
export type ObjectIdentityFormProps = {
 mode: 'signup' | 'login';
 busy: boolean;
 onWorking: (value: boolean) => void;
 /** Sign-up sends the new identity and its recovery record; login sends the username and the photo's descriptor. */
 onSubmit: (body: ObjectSignUpBody | ObjectLoginBody, recovery?: ObjectRecoveryV2) => Promise<boolean>;
 /** "Back" on the first step (e.g. return to the sign-up / log-in choice). Without it, the first step has no Back. */
 onBack?: () => void;
};
type Step = 'identity' | 'object' | 'review';
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Username + object, one step at a time. Sign-up: username → scan the object from a few angles → review and register.
 * Login: username → one photo of the same object, checked by the server.
 */
export default function ObjectIdentityForm({ mode, busy, onSubmit, onWorking, onBack }: ObjectIdentityFormProps) {
 const { client } = useTijori();
 const listId = useId();
 const [username, setUsername] = useState(''), [results, setResults] = useState<ObjectScanResult[] | null>(null);
 const [known, setKnown] = useState<string[]>([]), [recent, setRecent] = useState<ObjectRecoveryV2 | null>(null);
 const [working, setWorking] = useState(false), [error, setError] = useState('');
 const [step, setStep] = useState<Step>('identity'), [direction, setDirection] = useState(1);
 const disabled = busy || working;
 useEffect(() => {
  let live = true;
  // Start loading the on-device models while the username is typed (no photo is processed).
  void preloadObjectModels();
  Promise.all([listDeviceIdentities().catch(() => []), listObjectUsernames(client).catch(() => [])]).then(([device, server]) => {
   if (!live) return;
   const names = [...server.map(item => item.name), ...device.filter(item => item.recovery.version === 2).map(item => item.name)];
   setKnown([...new Set(names)]);
   // Resume a sign-up that was started on this device but not confirmed.
   const pending = device.find(item => item.status === 'pending' && item.recovery.version === 2);
   if (mode === 'signup' && pending) setUsername(current => current || pending.name);
   if (mode === 'login' && names.length === 1) setUsername(current => current || names[0]);
  });
  return () => { live = false; };
 }, [mode, client]);
 const taken = mode === 'signup' && known.some(name => sameName(name, username)) && !recent;
 const total = mode === 'signup' ? 3 : 2, current = step === 'identity' ? 1 : step === 'object' ? 2 : 3;
 const go = (next: Step, towards: number) => { setDirection(towards); setError(''); if (next !== 'review') setResults(null); setStep(next); };
 function advance() {
  if (disabled) return;
  if (step === 'identity' && username.trim() && !taken) go('object', 1);
  else if (step === 'object' && results?.length) { if (mode === 'signup') { setDirection(1); setError(''); setStep('review'); } else void submit(); }
 }
 function back() {
  if (disabled) return;
  if (step === 'identity') onBack?.();
  else go(step === 'review' ? 'object' : 'identity', -1);
 }
 async function submit() {
  if (disabled || !username.trim() || !results?.length) return;
  setWorking(true); onWorking(true); setError('');
  try {
   if (mode === 'login') { await onSubmit({ username: username.trim(), objectQuery: packObjectQuery(results[0].descriptor) }); return; }
   // A frozen camera stream can repeat a frame exactly; keep each distinct angle once.
   const distinct = [...new Map(results.map(result => [packObjectView(result.descriptor), result.descriptor])).values()];
   const objectProfile = packObjectProfileV2(distinct);
   const recovery = await createObjectIdentityV2(objectProfile);
   // Remember the new identity on this device before the server write, so an uncertain sign-up can be retried.
   await saveDeviceIdentity({ version: 1, name: username.trim(), status: 'pending', recovery });
   setRecent(recovery);
   const ok = await onSubmit({ name: username.trim(), address: recovery.address, objectName: OBJECT_IDENTITY_NAME, keyEnvelope: recovery.keyEnvelope, objectProfile }, recovery);
   if (ok) await saveDeviceIdentity({ version: 1, name: username.trim(), status: 'registered', recovery });
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not check the object.'); }
  finally { setWorking(false); onWorking(false); }
 }
 const stepName = step === 'identity' ? 'Your username' : step === 'object' ? 'Your object' : 'Review';
 return <fieldset className="tj-object-identity-form tj-guided-form" disabled={disabled} aria-busy={working}>
  <div className="tj-flow-navigation">
   {step !== 'identity' || onBack ? <button type="button" className="tj-flow-back" onClick={back}><ArrowLeft size={15} /> Back</button> : <span />}
   <span>{mode === 'signup' ? 'SIGN UP' : 'LOG IN'} <span aria-hidden="true">·</span> {current} OF {total}</span>
  </div>
  <div className="tj-flow-progress" role="progressbar" aria-label={mode === 'signup' ? 'Sign-up progress' : 'Login progress'} aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-valuetext={`Step ${current} of ${total}: ${stepName}`}>
   {Array.from({ length: total }, (_, index) => <span key={index} data-reached={index < current} />)}
  </div>
  <FlowPanel step={step} direction={direction}>
   <div className="tj-flow-content">
    {step === 'identity' && <>
     <h2 data-step-heading tabIndex={-1}>{mode === 'signup' ? 'First, pick a username.' : 'Good to have you back.'}</h2>
     <p className="tj-flow-description">{mode === 'signup' ? 'It’s how your people find you when they create a vault together. A nickname works, too.' : 'Enter the username you registered with.'}</p>
     <label>Username<input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); advance(); } }} maxLength={120} autoComplete="username" list={mode === 'login' ? listId : undefined} placeholder={mode === 'signup' ? 'e.g. alex' : 'Your username'} /></label>
     {mode === 'login' && <datalist id={listId}>{known.map(name => <option key={name} value={name} />)}</datalist>}
     {taken && <p className="tj-form-hint">This username is already registered. Choose another one, or log in.</p>}
    </>}
    {step === 'object' && <>
     <h2 data-step-heading tabIndex={-1}>{mode === 'signup' ? 'Something you’ll remember.' : 'Show your familiar object.'}</h2>
     <p className="tj-flow-description">{mode === 'signup' ? 'Pick an everyday object you’ll always have, like a bottle, a watch or a pen. Hold it inside the circle, tap Scan object and turn it slowly.' : `Show the object registered for ${username.trim()}, from any side. The server compares it with your registered object.`}</p>
     <ObjectCapture mode={mode === 'signup' ? 'scan' : 'photo'} disabled={disabled} onResult={value => { setResults(value); setError(''); }} />
     {!!results?.length && <p className="tj-capture-ready" role="status"><Check size={16} /> {mode === 'signup' ? 'Object scanned. You’re ready to review.' : 'Object ready. Log in to check it.'}</p>}
    </>}
    {step === 'review' && <>
     <h2 data-step-heading tabIndex={-1}>A little space for {username.trim()}.</h2>
     <p className="tj-flow-description">Your username and object are ready. One last thing before you begin.</p>
     <div className="tj-identity-review">
      <div><UserRound size={18} /><span><small>YOUR USERNAME</small><strong>{username.trim()}</strong></span></div>
      <div><Camera size={18} /><span><small>YOUR OBJECT</small><strong>{results?.length === 1 ? 'Scanned on this device' : `${results?.length} angles scanned on this device`}</strong></span><Check size={16} /></div>
     </div>
     <p className="tj-flow-disclosure">Demo only: the server checks your object at login, so a pen is not a bottle, but identical objects of the same model look the same, and stored data or a backup can unlock this identity without the object. It is not secure authentication. Your photos never leave this device.</p>
     {recent && <details className="tj-identity-backup"><summary>Optional backup of this identity</summary><p className="tj-form-hint">The backup file contains everything needed to unlock this identity without the object. Keep it private or skip it.</p><button type="button" className="tj-light-btn" onClick={() => downloadObjectRecovery(recent)}>Download optional backup</button></details>}
    </>}
    {error && <div className="tj-error" role="alert">{error}</div>}
   </div>
   <div className="tj-flow-actions">
    {step === 'identity' && <><button type="button" className="tj-submit" data-primary-action disabled={!username.trim() || taken} onClick={advance}>Next <ArrowRight size={17} /></button><p className="tj-flow-next">Next: {mode === 'signup' ? 'scan an object you’ll always have.' : 'show the object you registered.'}</p></>}
    {step === 'object' && <><button type="button" className="tj-submit" data-primary-action disabled={!results?.length} onClick={advance}>{working ? 'Checking your object…' : mode === 'signup' ? <>Next <ArrowRight size={17} /></> : <>Log in with my object <ArrowRight size={17} /></>}</button><p className="tj-flow-next">{mode === 'signup' ? 'Next: review before creating your identity.' : 'Your photo stays on this device; only compact features are checked.'}</p></>}
    {step === 'review' && <><button type="button" className="tj-submit" data-primary-action disabled={!results?.length || !username.trim()} onClick={() => void submit()}>{working ? 'Creating your identity…' : <>Create my identity <ArrowRight size={17} /></>}</button><p className="tj-flow-next">Your shared space is next.</p></>}
   </div>
  </FlowPanel>
 </fieldset>;
}
