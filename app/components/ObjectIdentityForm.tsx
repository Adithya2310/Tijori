'use client';
import { useEffect, useState } from 'react';
import ObjectCapture from './ObjectCapture';
import { packObjectProfile, unpackObjectProfile, type ObjectProfile } from '@/lib/object-profile';
import { type DinoFeatures } from '@/lib/dino';
import { createObjectIdentity, downloadObjectRecovery, parseObjectRecovery, verifyObjectRecovery, DINO_OBJECT_NAME, type ObjectRecovery } from '@/lib/dino-wallet';
import { listDeviceIdentities, listServerIdentities, saveDeviceIdentity, type DeviceIdentity } from '@/lib/device-identities';

export default function ObjectIdentityForm({ mode, busy, onSubmit, onWorking }: {
 mode: 'signup' | 'login'; busy: boolean; onWorking: (value: boolean) => void;
 onSubmit: (body: { name?: string; address: string; objectName: string; objectProfile?:ObjectProfile; keyEnvelope?: ObjectRecovery['keyEnvelope'] }, recovery: ObjectRecovery) => Promise<boolean>;
}) {
 const [name, setName] = useState(''), [features, setFeatures] = useState<DinoFeatures | null>(null);
 const [identities, setIdentities] = useState<DeviceIdentity[]>([]), [selected, setSelected] = useState('');
 const [ready, setReady] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('');
 const [result, setResult] = useState('');
 const disabled = busy || working;
 const remembered = identities.find(item => item.recovery.address === selected);
 useEffect(() => {
  let live = true;
  Promise.all([listDeviceIdentities(),listServerIdentities()]).then(([local,server]) => {
   const records=[...server,...local.filter(item=>!server.some(saved=>saved.recovery.address===item.recovery.address))];
   if (!live) return;
   setIdentities(records);
   const initial = mode === 'signup' ? records.find(item => item.status === 'pending') : records[0];
   if (initial) { setSelected(initial.recovery.address); if (mode === 'signup') setName(initial.name); }
   setReady(true);
  }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not read saved identities.'); });
  return () => { live = false; };
 }, [mode]);
 async function submit() {
  if (disabled || !ready || !features || (mode === 'signup' ? !name.trim() : !remembered)) return;
  setWorking(true); onWorking(true); setError(''); setResult('');
  try {
   let identity = remembered;
   if (mode === 'signup' && !identity) {
    const objectProfile=packObjectProfile(features);
    identity = { version: 1, name: name.trim(), status: 'pending', recovery: await createObjectIdentity(unpackObjectProfile(objectProfile),objectProfile) };
    // Persist before the server mutation so an uncertain signup can reuse this exact key.
    await saveDeviceIdentity(identity);
    setIdentities(items => [...items, identity!]); setSelected(identity.recovery.address);
   }
   if (!identity) throw Error('Choose a saved identity first.');
   if (mode === 'signup' && name.trim() !== identity.name) throw Error('Restore the original name to resume this pending signup.');
   const match = await verifyObjectRecovery(identity.recovery, features);
   setResult(`Object matched · ${Math.round(match.score * 100)}% similarity`);
   const success = await onSubmit({ ...(mode === 'signup' ? { name: identity.name, keyEnvelope: identity.recovery.keyEnvelope,objectProfile:identity.recovery.objectProfile } : {}), address: identity.recovery.address, objectName: DINO_OBJECT_NAME }, identity.recovery);
   if (success) await saveDeviceIdentity({ ...identity, status: 'registered' });
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not check the object.'); }
  finally { setWorking(false); onWorking(false); }
 }
 async function restore(file: File) {
  setWorking(true); onWorking(true); setError('');
  try {
   if (file.size > 3_000_000) throw Error('Recovery file is too large.');
   const recovery = parseObjectRecovery(await file.text());
   await verifyObjectRecovery(recovery, recovery.features);
   const existing = identities.find(item => item.recovery.address === recovery.address);
   const record: DeviceIdentity = existing || { version: 1, name: name.trim() || 'Imported identity', status: mode === 'signup' ? 'pending' : 'registered', recovery };
   await saveDeviceIdentity(record);
   setIdentities(items => [...items.filter(item => item.recovery.address !== recovery.address), record]);
   setSelected(recovery.address); setReady(true);
   if (mode === 'signup') setName(record.name);
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore the backup.'); }
  finally { setWorking(false); onWorking(false); }
 }
 return <fieldset className="object-identity-form" disabled={disabled}>
  <div className="scene-steps"><span className="scene-step">1 · {mode === 'signup' ? 'Your identity' : 'Remembered identity'}</span><span className="scene-step">2 · Show your object</span><span className="scene-step">3 · {mode === 'signup' ? 'Register' : 'Match & enter'}</span></div>
  <p className="form-hint">{mode === 'signup' ? 'Photograph an object you can show again. Tap to isolate it. Its compact reference is saved to server storage—no recovery file needed for everyday login.' : 'Show the same object you registered. Your reference is retrieved from server storage (Arkiv when enabled).'}</p>
  {mode === 'signup' ? <label>Your name<input value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name"/></label> : identities.length > 0 ? <label>Your registered identity<select value={selected} onChange={e => { setSelected(e.target.value); setResult(''); setError(''); }}>{identities.map(item => <option key={item.recovery.address} value={item.recovery.address}>{item.name} · {item.recovery.address.slice(0, 10)}…</option>)}</select></label> : ready ? <p className="notice">No object identity is registered on this server yet. Create one here, or restore an older browser-only identity below.</p> : <p role="status">Loading saved identities…</p>}
  {mode === 'signup' && remembered && <p className="notice">Resuming your saved signup for {remembered.name}. Show the same object to continue.</p>}
  <ObjectCapture isolate={mode==='signup'||!!remembered?.recovery.objectProfile} autoProcess disabled={disabled || !ready || (mode === 'login' && !remembered)} onFeatures={value => { setFeatures(value); setError(''); setResult(''); }}/>
  {result && <p className="notice" role="status">{result}</p>}
  {error && <div className="error" role="alert">{error}</div>}
  <button type="button" className="submit" disabled={disabled || !ready || !features || (mode === 'signup' ? !name.trim() : !remembered)} onClick={() => void submit()}>{working ? 'Checking your object…' : mode === 'signup' ? 'Register object & create identity' : 'Match object & log in'}</button>
  <p className="form-hint">Demo only: saved server/browser data can unlock this identity without a photo. Photos are discarded; compact features and the encrypted identity are stored on the server and cached in this browser. Arkiv-backed identities can be retrieved on another device. Older browser-only identities still need their optional backup. Safe still uses your connected wallet.</p>
  <details className="identity-backup"><summary>Optional backup / move an existing identity</summary><p className="form-hint">Use once when moving browsers or restoring an older user. Normal login only needs your object. This backup also contains everything needed to bypass the photo check.</p>{remembered && <button type="button" className="light-btn" onClick={() => downloadObjectRecovery(remembered.recovery)}>Download optional backup</button>}<label>Restore an existing backup<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }}/></label></details>
 </fieldset>;
}
