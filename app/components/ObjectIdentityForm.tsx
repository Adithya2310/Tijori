'use client';
import { useEffect, useState } from 'react';
import ObjectCapture from './ObjectCapture';
import { packMultiObjectProfile, unpackObjectProfile, type ObjectProfile } from '@/lib/object-profile';
import { type DinoFeatures } from '@/lib/dino';
import { scanQualityReason } from '@/lib/object-scan';
import { findUsername, usernameKey } from '@/lib/object-username';
import { createObjectIdentity, downloadObjectRecovery, parseObjectRecovery, unlockObjectIdentity, verifyObjectRecovery, DINO_OBJECT_NAME, type ObjectRecovery } from '@/lib/dino-wallet';
import { listDeviceIdentities, readServerIdentities, saveDeviceIdentity, type DeviceIdentity } from '@/lib/device-identities';

const viewInstructions=['Front: show the most distinctive markings.','Turn slightly left, keeping the object visible.','Turn slightly right, showing its other side.','Show the back or a different natural angle.'];

export default function ObjectIdentityForm({ mode, busy, onSubmit, onWorking }: {
 mode:'signup'|'login';busy:boolean;onWorking:(value:boolean)=>void;
 onSubmit:(body:{name?:string;username?:string;address:string;objectName:string;objectProfile?:ObjectProfile;keyEnvelope?:ObjectRecovery['keyEnvelope']},recovery:ObjectRecovery)=>Promise<boolean>;
}) {
 const [name,setName]=useState(''),[features,setFeatures]=useState<DinoFeatures|null>(null),[views,setViews]=useState<DinoFeatures[]>([]);
 const [identities,setIdentities]=useState<DeviceIdentity[]>([]),[selected,setSelected]=useState('');
 const [ready,setReady]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
 const [storageMode,setStorageMode]=useState<'arkiv'|'local'|null>(null),[capture,setCapture]=useState(0);
 const [availableBytes,setAvailableBytes]=useState<number|null>(null);
 const [externalProfiles,setExternalProfiles]=useState(false);
 const disabled=busy||working;
 let remembered:DeviceIdentity|undefined,lookupError='';
 if(mode==='signup')remembered=identities.find(item=>item.recovery.address===selected);
 else if(name.trim()) { try{remembered=findUsername(identities,name);}catch(e){lookupError=e instanceof Error?e.message:'Username not found.';} }
 const enrolling=mode==='signup'&&!remembered;
 const usernameTaken=enrolling&&identities.some(item=>usernameKey(item.name)===usernameKey(name));
 const qualityError=features?.scan?scanQualityReason(features.scan):null;
 useEffect(()=>{
  let live=true;
  Promise.all([listDeviceIdentities(),readServerIdentities()]).then(([local,server])=>{
   if(!live)return;
   const records=[...server.identities,...local.filter(item=>!server.identities.some(saved=>saved.recovery.address===item.recovery.address))];
   setIdentities(records);setStorageMode(server.storageMode);
   if(server.capacity){setAvailableBytes(server.capacity.maxBytes-server.capacity.usedBytes);setExternalProfiles(!!server.capacity.externalProfiles);}
   const pending=mode==='signup'?records.find(item=>item.status==='pending'):undefined;
   if(pending){setSelected(pending.recovery.address);setName(pending.name);}
   setReady(true);
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not read identity storage.');});
  return()=>{live=false;};
 },[mode]);
 function saveView() {
  if(!features?.scan||qualityError||views.length>=4)return;
  if(views.some(view=>view.scan?.imageId===features.scan!.imageId)){setError('Take a new camera photo for this angle.');return;}
  if(views.length&&views[0].scan?.category.label!==features.scan.category.label){setError('This view shows a different object category. Use the same physical object.');return;}
  setViews(items=>[...items,features]);setFeatures(null);setCapture(n=>n+1);setError('');
 }
 async function submit() {
  if(disabled||!ready||!name.trim()||(enrolling?views.length!==4:!features||!remembered))return;
  setWorking(true);onWorking(true);setError('');setResult('');
  try {
   let identity=remembered;
   if(enrolling) {
    if(identities.some(item=>usernameKey(item.name)===usernameKey(name)))throw Error('That username is already in use. Choose another.');
    const profile=packMultiObjectProfile(views,'object-demo-v1');
    if(availableBytes!==null&&(externalProfiles?2000:new TextEncoder().encode(JSON.stringify(profile)).length+1500)>availableBytes)throw Error('Not enough space for four views in this demo store. Existing records were preserved; this store has reached its capacity.');
    identity={version:1,name:name.trim().normalize('NFC'),status:'pending',recovery:await createObjectIdentity(unpackObjectProfile(profile),profile)};
    // Save the exact pending key before any uncertain server mutation.
    await saveDeviceIdentity(identity);setIdentities(items=>[...items,identity!]);setSelected(identity.recovery.address);
   } else {
    if(!identity||!features)throw Error('Enter your username and capture its registered object.');
    if(usernameKey(name)!==usernameKey(identity.name))throw Error('Username did not match this saved identity.');
    await verifyObjectRecovery(identity.recovery,features);
   }
   if(!identity)throw Error('No identity was selected.');
   const success=await onSubmit({...(mode==='signup'?{name:identity.name,keyEnvelope:identity.recovery.keyEnvelope,objectProfile:identity.recovery.objectProfile}:{username:name.trim()}),address:identity.recovery.address,objectName:DINO_OBJECT_NAME},identity.recovery);
   if(success){await saveDeviceIdentity({...identity,status:'registered'});setResult('Username and object check completed.');}
  }catch(e){setError(e instanceof Error?e.message:'Could not check the object.');}
  finally{setWorking(false);onWorking(false);}
 }
 async function restore(file:File) {
  setWorking(true);onWorking(true);setError('');
  try {
   if(file.size>3_000_000)throw Error('Recovery file is too large.');
   const recovery=parseObjectRecovery(await file.text());await unlockObjectIdentity(recovery,recovery.keyEnvelope);
   const existing=identities.find(item=>item.recovery.address===recovery.address);
   if(!existing&&!name.trim())throw Error('Enter the original username before restoring this backup.');
   const record:DeviceIdentity=existing??{version:1,name:name.trim(),status:mode==='signup'?'pending':'registered',recovery};
   await saveDeviceIdentity(record);setIdentities(items=>[...items.filter(item=>item.recovery.address!==recovery.address),record]);
   setName(record.name);setSelected(record.recovery.address);setFeatures(null);setViews([]);setCapture(n=>n+1);setReady(true);
  }catch(e){setError(e instanceof Error?e.message:'Could not restore the backup.');}
  finally{setWorking(false);onWorking(false);}
 }
 return <fieldset className="object-identity-form" disabled={disabled}>
  <label>{mode==='signup'?'Choose your username':'Your username'}<input value={name} maxLength={120} autoComplete="username" spellCheck={false} onChange={e=>{setName(e.target.value);setFeatures(null);setViews([]);setCapture(n=>n+1);setError('');setResult('');}}/></label>
  <p className="form-hint">{storageMode==='arkiv'?'Storage: Arkiv. Your username and encrypted object references are linked to one identity.':storageMode==='local'?'Storage: local demo on this laptop. This session does not save to Arkiv.':'Checking identity storage…'} Photos and masks stay on this device.</p>
  {usernameTaken&&<p role="alert" className="error">That username is already in use. Log in with its registered object or choose another username.</p>}
  {mode==='signup'&&remembered?.status==='pending'&&<div className="notice"><p>Resuming the saved signup for {remembered.name}. Its original key is preserved.</p><button className="light-btn" type="button" onClick={()=>{setSelected('');setName('');setViews([]);setFeatures(null);setCapture(n=>n+1);}}>Start a different enrollment</button></div>}
  {mode==='login'&&ready&&name.trim()&&<p role="status" className="form-hint">{lookupError||`Reference found for ${remembered?.name}. Show that same physical object.`}</p>}
  {remembered?.recovery.objectProfile?.version===1&&<p className="notice">This is an older one-view reference. Keep the original framing and orientation. It has not been upgraded or rekeyed.</p>}
  {enrolling&&<><p className="form-hint">Capture four views of one distinctive bottle, pen or watch. Plain lookalikes, people and unknown categories are unsuitable for this test build.</p><ol className="scene-steps" aria-label="Object views">{viewInstructions.map((text,i)=><li className="scene-step" key={text} aria-current={i===views.length?'step':undefined}>{i<views.length?'✓':i+1} · {text}</li>)}</ol></>}
  {enrolling&&views.length===4?<><p role="status" className="notice">Four views captured. Your photos have been discarded; only compact features will be saved.</p><button type="button" className="light-btn" onClick={()=>{setViews([]);setFeatures(null);setCapture(n=>n+1);}}>Retake the four views</button></>:<ObjectCapture key={`${mode}:${remembered?.recovery.address??usernameKey(name)}:${capture}`} isolate={enrolling||!!remembered?.recovery.objectProfile} preprocessVersion={enrolling||remembered?.recovery.objectProfile?.version===2?2:1} autoProcess disabled={disabled||!ready||!name.trim()||usernameTaken||(mode==='login'&&!remembered)} onFeatures={value=>{setFeatures(value);setError('');setResult('');}}/>}
  {qualityError&&<p role="alert" className="error">Please retake: {qualityError.replaceAll('_',' ')}. Use good light, clear markings and one supported object.</p>}
  {enrolling&&views.length<4&&<button type="button" className="light-btn" disabled={!features?.scan||!!qualityError||usernameTaken} onClick={saveView}>Keep view {views.length+1} & continue</button>}
  {result&&<p className="notice" role="status">{result}</p>}
  {error&&<div className="error" role="alert">{error}</div>}
  <button type="button" className="submit" disabled={disabled||!ready||!name.trim()||(enrolling?views.length!==4:!features||!remembered||!!qualityError)} onClick={()=>void submit()}>{working?'Checking…':mode==='signup'?'Save username & object':'Check username & object'}</button>
  <p className="form-hint">Object-only demo: stored features can bypass the camera check. This is not secure password replacement. No calibrated accuracy or replay protection is claimed. Use synthetic usernames and test funds only.</p>
  <details className="identity-backup"><summary>Optional backup / restore</summary><p className="form-hint">The backup contains the reference and encrypted demo key. Keep it private; possession bypasses the photo check. Restoring does not log you in.</p>{remembered&&<button type="button" className="light-btn" onClick={()=>downloadObjectRecovery(remembered.recovery)}>Download backup</button>}<label>Restore backup<input type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void restore(file);e.target.value='';}}/></label></details>
 </fieldset>;
}
