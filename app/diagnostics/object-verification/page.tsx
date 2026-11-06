'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ObjectCapture from '../../components/ObjectCapture';
import type { DinoFeatures } from '@/lib/dino';
import { packObjectProfile, multiProfileFromViews, unpackObjectProfile } from '@/lib/object-profile';
import { compareObjectScan } from '@/lib/object-verification';
import { scanQualityReason } from '@/lib/object-scan';
import type { EvaluationSample, EvaluationManifest } from '@/lib/object-evaluation';
import styles from './page.module.css';

type Trial={expected:boolean;result:ReturnType<typeof compareObjectScan>};
const angles=['front','left','right','back'];
const categories=['bottle','pen','watch','person','background','other'];

export default function ObjectVerificationReview() {
 useEffect(()=>{
  if(process.env.NODE_ENV!=='development')return;
  const target=window as Window&{tichoriObjectReview?:(image:Blob,point:{x:number;y:number},worker?:boolean)=>Promise<DinoFeatures>};
  // Development-only hook for public-fixture browser runtime checks. It exposes
  // no stored identities, keys or camera access and is absent in production.
  const run=async(image:Blob,point:{x:number;y:number},useWorker=false):Promise<DinoFeatures>=>{
   if(!useWorker)return (await import('@/lib/dino-inference')).extractObjectFeatures(image,()=>{},()=>false,point,2);
   const worker=new Worker(new URL('../../dino.worker.ts',import.meta.url),{type:'module'});
   return new Promise((resolve,reject)=>{
    const finish=(value?:DinoFeatures,error?:string)=>{clearTimeout(deadline);worker.terminate();if(value)resolve(value);else reject(Error(error??'Worker failed.'));};
    const deadline=setTimeout(()=>finish(undefined,'Worker smoke check timed out.'),120_000);
    worker.onerror=e=>finish(undefined,e.message);
    worker.onmessage=e=>{if(e.data.status==='complete')finish(e.data.features);else if(e.data.status==='error')finish(undefined,e.data.message);};
    worker.postMessage({image,point,preprocessVersion:2});
   });
  };
  target.tichoriObjectReview=run;
  return()=>{if(target.tichoriObjectReview===run)delete target.tichoriObjectReview;};
 },[]);
 const [refs,setRefs]=useState<EvaluationSample[]>([]),[samples,setSamples]=useState<EvaluationSample[]>([]);
 const [reference,setReference]=useState<DinoFeatures|null>(null),[candidate,setCandidate]=useState<DinoFeatures|null>(null);
 const [instance,setInstance]=useState('bottle-a'),[category,setCategory]=useState('bottle'),[queryId,setQueryId]=useState('bottle-a'),[queryCategory,setQueryCategory]=useState('bottle');
 const [split,setSplit]=useState<EvaluationSample['split']>('development'),[device,setDevice]=useState('device-a'),[session,setSession]=useState('session-a'),[angle,setAngle]=useState('front');
 const [trials,setTrials]=useState<Trial[]>([]),[attempt,setAttempt]=useState(0),[refAttempt,setRefAttempt]=useState(0),[error,setError]=useState('');
 const full=samples.length>=500;
 function record(features:DinoFeatures,role:EvaluationSample['role']):EvaluationSample {
  if(!features.scan)throw Error('This capture has no versioned object evidence.');
  if(samples.some(s=>s.scan.imageId===features.scan!.imageId))throw Error('Take a fresh camera capture; this image is already in the dataset.');
  const metadata={instanceId:(role==='enrollment'?instance:queryId).trim(),category:role==='enrollment'?category:queryCategory,angle:role==='enrollment'?angles[refs.length]:angle,device:device.trim(),session:session.trim()};
  if(Object.values(metadata).some(v=>!v))throw Error('Fill in the physical object label, angle, device and session.');
  return {id:features.scan.imageId,...metadata,split,role,profile:packObjectProfile(features),scan:features.scan};
 }
 function keepView() {
  if(!reference||refs.length>=4||full)return;
  try {
   if(!reference.scan||scanQualityReason(reference.scan))throw Error('Retake this view: '+(reference.scan?scanQualityReason(reference.scan):'missing evidence'));
   if(refs.length&&reference.scan.category.label!==refs[0].scan.category.label)throw Error('The model sees a different category. Use the same object.');
   const sample=record(reference,'enrollment');setRefs(v=>[...v,sample]);setSamples(v=>[...v,sample]);setReference(null);setRefAttempt(n=>n+1);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not keep this view.');}
 }
 function check() {
  if(refs.length!==4||!candidate||full)return;
  try {
   const sample=record(candidate,'query');
   const profile=multiProfileFromViews(refs.map(s=>({data:s.profile.data,scan:s.scan})));
   const result=compareObjectScan(unpackObjectProfile(profile),candidate,profile);
   setSamples(v=>[...v,sample]);setTrials(v=>[{expected:sample.instanceId===refs[0].instanceId,result},...v]);
   setCandidate(null);setAttempt(n=>n+1);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not compare captures.');}
 }
 function download() {
  const manifest:EvaluationManifest={version:1,samples};
  const url=URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='object-evaluation-dataset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const falseAccepts=trials.filter(t=>!t.expected&&t.result.matched).length;
 const falseRejects=trials.filter(t=>t.expected&&t.result.decision==='REJECT').length;
 const retries=trials.filter(t=>t.result.decision==='RETRY').length;
 return <main className={styles.page}>
  <Link href="/">← Back to Tichori</Link><h1>Test object recognition</h1>
  <p>Capture four views of one physical object, then test fresh captures of it and other objects. Test a bottle against a pen in both directions, then try two similar bottles or pens. A global score alone cannot pass.</p>
  <p>This page runs the same checks as new enrollment/login. It creates no identity and makes no identity API calls. Photos are discarded; compact features and results remain in this tab until reload. Downloading the optional dataset saves features locally, with no photos or keys.</p>
  <div className={styles.grid}>
   <section><h2>1. Four reference views</h2>
    <label>Physical object label<input value={instance} disabled={refs.length>0} maxLength={120} onChange={e=>{setInstance(e.target.value);setQueryId(e.target.value);}}/></label>
    <label>Actual category<select value={category} disabled={refs.length>0} onChange={e=>{setCategory(e.target.value);setQueryCategory(e.target.value);}}>{categories.slice(0,3).map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Dataset split<select value={split} disabled={refs.length>0} onChange={e=>setSplit(e.target.value as EvaluationSample['split'])}><option value="development">Development</option><option value="calibration">Calibration — separate objects</option><option value="heldout">Held-out — untouched objects</option></select></label>
    <label>Device label<input value={device} maxLength={120} onChange={e=>setDevice(e.target.value)}/></label><label>Session label<input value={session} maxLength={120} onChange={e=>setSession(e.target.value)}/></label>
    {refs.length<4?<><p>View {refs.length+1} of 4: {angles[refs.length]}. Keep distinctive markings visible.</p><ObjectCapture key={refAttempt} isolate autoProcess disabled={full} onFeatures={setReference}/><button className="light-btn" type="button" disabled={!reference||full} onClick={keepView}>Keep this view</button></>:<><p>Four views ready for {refs[0].instanceId}.</p><button className="light-btn" type="button" onClick={()=>{setRefs([]);setReference(null);setCandidate(null);setRefAttempt(n=>n+1);setAttempt(n=>n+1);}}>Capture another reference object</button></>}
   </section>
   <section><h2>2. Test a fresh capture</h2>
    <label>Physical object label<input value={queryId} maxLength={120} onChange={e=>{setQueryId(e.target.value);setCandidate(null);setAttempt(n=>n+1);}}/></label>
    <p>Use the same label only for the exact same physical object. A different pen or bottle needs a different label.</p>
    <label>Actual category<select value={queryCategory} onChange={e=>setQueryCategory(e.target.value)}>{categories.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Viewing angle<input value={angle} maxLength={120} onChange={e=>setAngle(e.target.value)}/></label>
    <ObjectCapture key={attempt} isolate autoProcess disabled={refs.length!==4||full} onFeatures={setCandidate}/>
    <button className="submit" type="button" disabled={refs.length!==4||!candidate||full} onClick={check}>Compare captures</button>
   </section>
  </div>
  {error&&<p role="alert" className="error">{error}</p>}
  <section aria-live="polite"><h2>Results</h2><p>{trials.length} trials · {falseAccepts} false accepts · {falseRejects} false rejects · {retries} retries</p>
   <p>These are uncalibrated test decisions, not confidence percentages or secure authentication. A RETRY means the evidence was insufficient; it does not allow login.</p>
   <button type="button" className="light-btn" disabled={!samples.length||refs.length>0&&refs.length<4} onClick={download}>Download local evaluation dataset ({samples.length} captures)</button>
   {full&&<p>Capture limit reached. Download this dataset before reloading to start another.</p>}
   <ol className={styles.results}>{trials.map((t,i)=><li key={trials.length-i}><strong>{t.result.decision} · {t.result.reason.replaceAll('_',' ')}</strong><p>Expected {t.expected?'same':'different'} physical object. Best enrolled view: {t.result.view+1}. Global {t.result.global.toFixed(3)} · patch agreement {t.result.agreement.toFixed(3)}.</p><p>Detail coverage {t.result.detail.coverage.toFixed(3)} · {t.result.detail.inliers} coherent pairs · geometry ratio {t.result.detail.inlierRatio.toFixed(3)} · region coverage {t.result.detail.regionCoverage.toFixed(3)}.</p><details><summary>Nonsecret diagnostics</summary><p>Policy {t.result.thresholdVersion}, uncalibrated. Source {t.result.sourceImageId}. Query {t.result.candidateImageId}.</p></details></li>)}</ol>
  </section>
 </main>;
}
