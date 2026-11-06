'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, Radio, X } from 'lucide-react';

type Group = {id:string;name:string;members:{id:string;name:string}[]};
type Session = {id:string;hostId:string;expiresAt:number;status:string;matches:{walletId:string;verifiedAt:number;attestationHash:string}[]};
type Modem = typeof import('@/lib/acousticModem');
async function api(groupId:string,walletId:string,body?:object,operationId?:string) {
 const response=await fetch(body?'/api/proximity':`/api/proximity?${new URLSearchParams({groupId,walletId})}`, body?{method:'POST',headers:{'Content-Type':'application/json',...(operationId?{'Idempotency-Key':operationId}:{})},body:JSON.stringify({groupId,walletId,...body})}:{cache:'no-store'});
 const result=await response.json();
 if(!response.ok) throw Error(result.error || 'Could not connect to the group check.');
 return result as {session:Session|null;nonce?:string};
}
export default function ProximityCheck({group,walletId,storageMode}:{group:Group;walletId:string;storageMode?:'local'|'arkiv'}) {
 const headingId=useId();
 const audioHintId=useId();
 const [ultrasound,setUltrasound]=useState(false);
 const operationKey=`tichori-proximity:${group.id}:${walletId}`;
 const [session,setSession]=useState<Session|null>(null),[opened,setOpened]=useState(false),[mode,setMode]=useState<'idle'|'starting'|'permission'|'broadcasting'|'listening'>('idle'),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[level,setLevel]=useState(0),[now,setNow]=useState(()=>Date.now()),[audioReady,setAudioReady]=useState(false);
 const audioSession=useRef<string|null>(null),revision=useRef(0);
 const modem=useRef<Modem|null>(null),generation=useRef(0),running=useRef(false),hostSession=useRef<string|null>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{let live=true;import('@/lib/acousticModem').then(value=>{if(live){modem.current=value;setAudioReady(true);}}).catch(()=>{if(live)setError('Could not load the acoustic modem. Reload to try again.');});return ()=>{live=false;};},[]);
 function stopAudio() {
  generation.current++;running.current=false;
  modem.current?.stopChallengeTone();modem.current?.stopAcousticListener();setMode('idle');setLevel(0);
 }
 useEffect(()=>{
  const generationRef=generation;
  let disposed=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  async function refresh() {
   try {const version=revision.current;const r=await fetch(`/api/proximity?${new URLSearchParams({groupId:group.id,walletId})}`,{cache:'no-store',signal:controller.signal});const result=await r.json();if(!r.ok)throw Error(result.error);if(!disposed && version===revision.current){setSession(result.session);setNow(Date.now());setConnectionError('');}}
   catch(e){if(!disposed){setConnectionError(e instanceof Error?e.message:'Connection lost.');if(running.current){generationRef.current++;running.current=false;modem.current?.stopChallengeTone();modem.current?.stopAcousticListener();setMode('idle');}}}
   finally{if(!disposed)timer=setTimeout(refresh,1500);}
  }
  void refresh();const clock=setInterval(()=>setNow(Date.now()),1000);
  return ()=>{disposed=true;controller.abort();clearTimeout(timer);clearInterval(clock);if(running.current){generationRef.current++;running.current=false;modem.current?.stopChallengeTone();modem.current?.stopAcousticListener();}const id=hostSession.current;if(id)void fetch('/api/proximity',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',groupId:group.id,walletId,sessionId:id})}).catch(()=>{});};
 },[group.id,walletId]);
 const active=session?.status==='active' && session.expiresAt>now;
 const ownMatch=session?.matches.find(m=>m.walletId===walletId);
 const ended=!!session && (!active || !!ownMatch);
 useEffect(()=>{
  if(!running.current || (!ended && (!audioSession.current || audioSession.current===session?.id)))return;
  generation.current++;running.current=false;modem.current?.stopChallengeTone();modem.current?.stopAcousticListener();
 },[ended,session?.id]);
 useEffect(()=>{
  if(opened){dialog.current?.showModal();}else{dialog.current?.close();trigger.current?.focus();}
 },[opened]);
 async function close() {
  revision.current++;stopAudio();setOpened(false);
  const id=hostSession.current;hostSession.current=null;
  if(id)try{const result=await api(group.id,walletId,{action:'cancel',sessionId:id});setSession(result.session);sessionStorage.removeItem(operationKey);}catch(e){setError(e instanceof Error?e.message:'Could not end check. It expires automatically.');}
 }
 async function begin(kind:'host'|'listener',button:HTMLButtonElement) {
  if(running.current)return;
  revision.current++;trigger.current=button;setOpened(true);setError('');setMode('starting');running.current=true;
  const attempt=++generation.current;
  const current=()=>attempt===generation.current;
  let created:string|undefined;
  try {
   if(!window.isSecureContext)throw Error('Microphone checks need HTTPS on both devices. Localhost also works on this computer.');
   // Create/resume Web Audio before the first network await (mobile user gesture).
   if(!modem.current)throw Error('The acoustic modem is still loading. Try again.');
   await modem.current.initModem();if(!current())return;
   if(kind==='host') {
    let operationId=sessionStorage.getItem(operationKey);
    if(!operationId || (session && !active)){operationId=crypto.randomUUID();sessionStorage.setItem(operationKey,operationId);}
    const result=await api(group.id,walletId,{action:'start'},operationId);created=result.session?.id;
    if(!current()){if(created)await api(group.id,walletId,{action:'cancel',sessionId:created});return;}
    audioSession.current=created||null;setSession(result.session);setNow(Date.now());hostSession.current=created||null;
    if(!result.session || !result.nonce){sessionStorage.removeItem(operationKey);throw Error('This check ended. Close and start a fresh check.');}
    const expires=result.session.expiresAt;
    setMode('broadcasting');
    while(current() && Date.now()<expires) {
     await modem.current.playChallengeTone(result.nonce,ultrasound);
     // Short silence between repeated acoustic frames.
     await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(current())stopAudio();
   }else{
    const listeningSession=session;
    if(!listeningSession || !active)throw Error('No active check. Ask a member to click Send first.');
    audioSession.current=listeningSession.id;
    let verifying=false;
    setMode('permission');
    const started=await modem.current.startAcousticListener(async nonce=>{
     if(!current()||verifying)return;verifying=true;
     try{
      const result=await api(group.id,walletId,{action:'verify',sessionId:listeningSession.id,nonce});
      if(current()){setSession(result.session);setError('');stopAudio();}
     }catch(e){if(current())setError(e instanceof Error?e.message:'Signal did not match.');}
     finally{verifying=false;}
    },value=>{if(current())setLevel(value);});
    if(current() && started)setMode('listening');
   }
  }catch(e){
   if(current()){stopAudio();setError(e instanceof Error?e.message:'Audio could not start. Check browser permissions.');}
   if(created){hostSession.current=null;await api(group.id,walletId,{action:'cancel',sessionId:created}).catch(()=>{});}
  }
 }
 const seconds=session?Math.max(0,Math.ceil((session.expiresAt-now)/1000)):0;
 return <div className="proximity-check">
  <p className="check-status" aria-live="polite">{active?`Acoustic check active · ${seconds}s left`:session?.status==='cancelled'?'Last check ended':session?'Last check expired':'Ready for an acoustic check'}</p>
  {session && session.matches.length>0 && <p className="check-status">{session.matches.length} of {group.members.length-1} other members matched</p>}
  <label className="object-consent"><input type="checkbox" role="switch" checked={ultrasound} disabled={opened} aria-describedby={audioHintId} onChange={e=>setUltrasound(e.target.checked)}/><span>Ultrasound broadcast {ultrasound?'on':'off'}</span></label>
  <p className="form-hint" id={audioHintId}>{ultrasound?'Send uses high-frequency audio (about 15–19.5 kHz). Some people may still hear it; speaker and microphone support varies.':'Send uses an audible signal for easier testing.'} Listeners detect both modes automatically. Stop and close a check before switching modes. Use device speakers, without headphones.</p>
  <div className="group-actions"><button disabled={(!!active && session?.hostId!==walletId) || mode!=='idle' || !audioReady} onClick={e=>void begin('host',e.currentTarget)}>{active&&session?.hostId===walletId?'Resume signal':'Send'} <Radio size={14}/></button><button disabled={mode!=='idle' || !audioReady || !active || session?.hostId===walletId || !!ownMatch} onClick={e=>void begin('listener',e.currentTarget)}>{ownMatch&&active?'Matched':'Join check'} <AudioLines size={14}/></button></div>
  {(error||connectionError)&&!opened&&<p className="error" role="alert">{error||connectionError}</p>}
  <dialog ref={dialog} className="modal proximity-dialog" aria-labelledby={headingId} onCancel={e=>{e.preventDefault();void close();}}>
   <button className="modal-close" onClick={()=>void close()} aria-label="Close acoustic check"><X size={19}/></button>
   <div className="modal-icon"><Radio/></div><div className="section-kicker">GROUP PROXIMITY</div><h2 id={headingId}>{group.name}</h2>
   <p className="modal-desc">{session?.hostId===walletId?`Your device plays ${ultrasound?'a high-frequency ultrasound':'an audible'} signal. Ask other members to open this vault and tap Join check.`:'Listen near the broadcasting device. Audible and ultrasound signals are detected automatically. Keep this screen open and allow microphone access.'}</p>
   <p className="check-status">{session?.hostId===walletId?`Broadcast mode: ${ultrasound?'Ultrasound · about 15–19.5 kHz':'Audible'}`:'Receive mode: automatic · audible + ultrasound'}</p>
   <div className="dial-wrap"><div className="dial"><div className="dial-inner"><AudioLines size={27}/><strong className="dial-listening">{ownMatch?'Signal matched':ended?'Check ended':mode==='starting'?'Starting…':mode==='permission'?'Allow microphone':mode==='broadcasting'?'Broadcasting':mode==='listening'?'Listening':'Ready'}</strong><small>{active?`${seconds}s remaining`:'ACOUSTIC CHECK'}</small></div></div></div>
   {mode==='listening'&&!ended&&<label>Microphone level<meter min="0" max="100" value={level} aria-label="Microphone level"/></label>}
   <div className="signal-banner"><Radio size={20}/><div><strong>Acoustic matching only · No transfers</strong><small>Audio stays on your device. Decoded challenges and matches are stored in {storageMode==='local'?'the laptop’s encrypted local database. No Arkiv writes are made.':'encrypted Arkiv state. Public storage metadata remains visible.'} A match can be replayed or relayed and does not guarantee physical proximity or verify identity.</small></div></div>
   <ul className="check-members">{group.members.map(m=><li key={m.id}><span>{m.name}</span><span>{session?.hostId===m.id?'Broadcaster':session?.matches.some(v=>v.walletId===m.id)?'Signal matched':'Waiting to join'}</span></li>)}</ul>
   {ownMatch&&<p className="form-hint">Matched at {new Date(ownMatch.verifiedAt).toLocaleTimeString()}. Recorded for this check only.</p>}
   {(error||connectionError)&&<div className="error" role="alert">{error||connectionError}</div>}
   <button className="submit" onClick={()=>void close()}>{session?.hostId===walletId?'Stop and close':'Close check'}</button>
  </dialog>
 </div>;
}
