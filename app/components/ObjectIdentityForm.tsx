'use client';
import { useEffect, useState } from 'react';
import ObjectCapture from './ObjectCapture';
import FlowPanel from './FlowPanel';
import { ArrowLeft, ArrowRight, Check, Camera, UserRound } from 'lucide-react';
import { packObjectProfile, unpackObjectProfile, type ObjectProfile } from '@/lib/object-profile';
import { type DinoFeatures } from '@/lib/dino';
import { createObjectIdentity, downloadObjectRecovery, parseObjectRecovery, verifyObjectRecovery, DINO_OBJECT_NAME, type ObjectRecovery } from '@/lib/dino-wallet';
import { listDeviceIdentities, listServerIdentities, saveDeviceIdentity, type DeviceIdentity } from '@/lib/device-identities';

export default function ObjectIdentityForm({ mode, busy, onSubmit, onWorking, onBack }: {
 onBack: () => void;
 mode: 'signup' | 'login'; busy: boolean; onWorking: (value: boolean) => void;
 onSubmit: (body: { name?: string; address: string; objectName: string; objectProfile?:ObjectProfile; keyEnvelope?: ObjectRecovery['keyEnvelope'] }, recovery: ObjectRecovery) => Promise<boolean>;
}) {
 const [name, setName] = useState(''), [features, setFeatures] = useState<DinoFeatures | null>(null);
 const [identities, setIdentities] = useState<DeviceIdentity[]>([]), [selected, setSelected] = useState('');
 const [ready, setReady] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('');
 const [result, setResult] = useState('');
 const disabled = busy || working;
 const remembered = identities.find(item => item.recovery.address === selected);
 const [step, setStep] = useState<'identity' | 'object' | 'review'>('identity');
 const [direction, setDirection] = useState(1);
 const currentStep = step === 'identity' ? 1 : step === 'object' ? 2 : 3;
 const totalSteps = mode === 'signup' ? 3 : 2;
 function advance() {
  if (disabled || !ready) return;
  if (step === 'identity' && (mode === 'signup' ? !!name.trim() : !!remembered)) {
   setDirection(1); setError(''); setStep('object');
  } else if (step === 'object' && features) { setDirection(1); setError(''); setStep('review'); }
 }
 function back() {
  if (disabled) return;
  setDirection(-1); setError(''); setResult('');
  if (step === 'identity') onBack();
  else { setFeatures(null); setStep(step === 'review' ? 'object' : 'identity'); }
 }
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
 return <fieldset className="object-identity-form guided-form" disabled={disabled} aria-busy={working}>
  <div className="flow-navigation"><button type="button" className="flow-back" onClick={back}><ArrowLeft size={15}/> Back</button><span>{mode === 'signup' ? 'SIGN UP' : 'LOG IN'} <span aria-hidden="true">·</span> {currentStep} OF {totalSteps}</span></div>
  <div className="flow-progress" role="progressbar" aria-label={mode === 'signup' ? 'Sign-up progress' : 'Login progress'} aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={currentStep} aria-valuetext={`Step ${currentStep} of ${totalSteps}: ${step === 'identity' ? 'Your identity' : step === 'object' ? 'Your object' : 'Review'}`}>
   {Array.from({length: totalSteps}, (_, index) => <span key={index} data-reached={index < currentStep}/>)}</div>
  <FlowPanel step={step} direction={direction}>
   <div className="flow-content">
    {step === 'identity' && <>
     <h2 data-step-heading tabIndex={-1}>{mode === 'signup' ? 'First, what’s your name?' : 'Good to have you back.'}</h2>
     <p className="flow-description">{mode === 'signup' ? 'Just a name for your shared space. A nickname works, too.' : 'Choose the identity you want to return to.'}</p>
     {mode === 'signup' ? <label>Your name<input placeholder="e.g. Alex" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); advance(); } }} maxLength={120} autoComplete="name" readOnly={!!remembered}/></label> : identities.length > 0 ? <label>Your identity<select value={selected} onChange={e => { setSelected(e.target.value); setFeatures(null); setResult(''); setError(''); }}>{identities.map(item => <option key={item.recovery.address} value={item.recovery.address}>{item.name} · {item.recovery.address.slice(0, 10)}…</option>)}</select></label> : ready ? <p className="notice">No object identity was found. Go back to sign up, or restore your backup below.</p> : <p role="status" className="form-hint">Finding your saved identities…</p>}
     {mode === 'signup' && remembered && <p className="notice">Your signup for {remembered.name} is saved. Continue with its original name and object.</p>}
     <details className="identity-backup"><summary>{mode === 'signup' ? 'Resume or restore a saved identity' : 'Can’t find your identity?'}</summary><p className="form-hint">Restore an optional backup from another browser. It contains everything needed to bypass the photo check; keep it private.</p>{remembered && <button type="button" className="light-btn" onClick={() => downloadObjectRecovery(remembered.recovery)}>Download optional backup</button>}<label>Restore a backup<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }}/></label></details>
    </>}
    {step === 'object' && <>
     <h2 data-step-heading tabIndex={-1}>{mode === 'signup' ? 'Something you’ll remember.' : 'Show your familiar object.'}</h2>
     <p className="flow-description">{mode === 'signup' ? 'Pick an everyday object you can show again. Take a photo, then tap the object to scan it.' : `Take a fresh photo of the object registered for ${remembered?.name || 'your identity'}.`}</p>
     <ObjectCapture isolate={mode==='signup'||!!remembered?.recovery.objectProfile} autoProcess disabled={disabled || !ready || (mode === 'login' && !remembered)} onFeatures={value => { setFeatures(value); setError(''); setResult(''); }}/>
     {features && <p className="capture-ready" role="status"><Check size={16}/> Object scanned. {mode === 'signup' ? 'You’re ready to review.' : 'Ready to check your match.'}</p>}
    </>}
    {step === 'review' && <>
     <h2 data-step-heading tabIndex={-1}>A little space for {name.trim()}.</h2>
     <p className="flow-description">Your name and object are ready. One last thing before you begin.</p>
     <div className="identity-review"><div><UserRound size={18}/><span><small>YOUR NAME</small><strong>{name.trim()}</strong></span></div><div><Camera size={18}/><span><small>YOUR OBJECT</small><strong>Scanned on this device</strong></span><Check size={16}/></div></div>
     <p className="flow-disclosure">This is an object-matching demo, not authentication or secure recovery. Stored reference data can unlock the identity without a photo. Compact references and an encrypted key are saved on the server; your original photo is discarded. Safe uses a separate connected wallet.</p>
    </>}
    {result && <p className="notice" role="status">{result}</p>}
    {error && <div className="error" role="alert">{error}</div>}
   </div>
   <div className="flow-actions">
    {step === 'identity' && <><button type="button" className="submit" data-primary-action disabled={!ready || (mode === 'signup' ? !name.trim() : !remembered)} onClick={advance}>Next <ArrowRight size={17}/></button><p className="flow-next">Next: {mode === 'signup' ? 'choose an object and take a photo.' : 'show the same object you registered.'}</p></>}
    {step === 'object' && <><button type="button" className="submit" data-primary-action disabled={!ready || !features || (mode === 'login' && !remembered)} onClick={() => mode === 'signup' ? advance() : void submit()}>{working ? 'Checking your object…' : mode === 'signup' ? <>Next <ArrowRight size={17}/></> : <>Match object & log in <ArrowRight size={17}/></>}</button><p className="flow-next">{mode === 'signup' ? 'Next: review before creating your demo identity.' : 'Your photo stays on this device. The match runs here.'}</p></>}
    {step === 'review' && <><button type="button" className="submit" data-primary-action disabled={!ready || !features || !name.trim()} onClick={() => void submit()}>{working ? 'Creating your identity…' : <>Create my demo identity <ArrowRight size={17}/></>}</button><p className="flow-next">Your shared space is next.</p></>}
   </div>
  </FlowPanel>
 </fieldset>;
}
