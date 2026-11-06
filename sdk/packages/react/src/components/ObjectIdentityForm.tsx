'use client';
import { useEffect, useId, useState } from 'react';
import { OBJECT_IDENTITY_NAME, packObjectProfileV2, packObjectQuery, packObjectView, type ObjectProfileV2, type ObjectQuery } from '@tijori/core/object-profile';
import { createObjectIdentityV2, downloadObjectRecovery, listDeviceIdentities, listObjectUsernames, saveDeviceIdentity, type ObjectRecoveryV2, type ObjectScanResult } from '@tijori/client';
import type { KeyEnvelope } from '@tijori/core/identity-key';
import ObjectCapture from './ObjectCapture.tsx';
import { useTijori } from '../context.tsx';

export type ObjectSignUpBody = { name: string; address: string; objectName: string; keyEnvelope: KeyEnvelope; objectProfile: ObjectProfileV2 };
export type ObjectLoginBody = { username: string; objectQuery: ObjectQuery };
export type ObjectIdentityFormProps = {
 mode: 'signup' | 'login';
 busy: boolean;
 onWorking: (value: boolean) => void;
 /** Sign-up sends the new identity and its recovery record; login sends the username and the photo's descriptor. */
 onSubmit: (body: ObjectSignUpBody | ObjectLoginBody, recovery?: ObjectRecoveryV2) => Promise<boolean>;
};
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Username + object. Sign-up scans the object from a few angles in one tap; login takes one photo. */
export default function ObjectIdentityForm({ mode, busy, onSubmit, onWorking }: ObjectIdentityFormProps) {
 const { client } = useTijori();
 const listId = useId();
 const [username, setUsername] = useState(''), [results, setResults] = useState<ObjectScanResult[] | null>(null);
 const [known, setKnown] = useState<string[]>([]), [recent, setRecent] = useState<ObjectRecoveryV2 | null>(null);
 const [working, setWorking] = useState(false), [error, setError] = useState('');
 const disabled = busy || working;
 useEffect(() => {
  let live = true;
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
 const ready = !!username.trim() && !!results?.length && !disabled;
 async function submit() {
  if (!ready || !results) return;
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
 const taken = mode === 'signup' && known.some(name => sameName(name, username)) && !recent;
 return <fieldset className="tj-object-identity-form" disabled={disabled}>
  <div className="tj-scene-steps"><span className="tj-scene-step">1 · Username</span><span className="tj-scene-step">2 · {mode === 'signup' ? 'Scan your object' : 'Show your object'}</span><span className="tj-scene-step">3 · {mode === 'signup' ? 'Register' : 'Log in'}</span></div>
  <label>Username<input value={username} onChange={e => setUsername(e.target.value)} maxLength={120} autoComplete="username" list={mode === 'login' ? listId : undefined} placeholder={mode === 'signup' ? 'Choose a username' : 'Your username'}/></label>
  {mode === 'login' && <datalist id={listId}>{known.map(name => <option key={name} value={name}/>)}</datalist>}
  {taken && <p className="tj-form-hint">This username is already registered. Choose another one, or log in.</p>}
  <p className="tj-form-hint">{mode === 'signup' ? 'Pick an everyday object you will always have, like a bottle, a watch or a pen. Hold it in the centre of the camera, tap Scan and turn it slowly. Your username is linked to this object.' : 'Show the same object you registered, from any side. The server compares it with your registered object.'}</p>
  <ObjectCapture mode={mode === 'signup' ? 'scan' : 'photo'} disabled={disabled} onResult={value => { setResults(value); setError(''); }}/>
  {error && <div className="tj-error" role="alert">{error}</div>}
  <button type="button" className="tj-submit" disabled={!ready || taken} onClick={() => void submit()}>{working ? (mode === 'signup' ? 'Registering…' : 'Checking your object…') : mode === 'signup' ? 'Register username & object' : 'Log in with my object'}</button>
  <p className="tj-form-hint">Demo only: the object check tells different objects apart (a pen is not a bottle), but identical objects of the same model look the same. It is not secure authentication.</p>
  {recent && <details className="tj-identity-backup"><summary>Optional backup of this identity</summary><p className="tj-form-hint">The backup file contains everything needed to unlock this identity without the object. Keep it private or skip it.</p><button type="button" className="tj-light-btn" onClick={() => downloadObjectRecovery(recent)}>Download optional backup</button></details>}
 </fieldset>;
}
