'use client';
import { useEffect, useRef, useState } from 'react';
import { validDinoFeatures, type DinoFeatures } from '@/lib/dino';

export default function ObjectCapture({ disabled, onFeatures, autoProcess = false, isolate=false }: { disabled: boolean; autoProcess?: boolean; isolate?:boolean; onFeatures: (features: DinoFeatures | null) => void }) {
 const worker = useRef<Worker | null>(null);
 const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const startupTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const generation = useRef(0);
 const [consent, setConsent] = useState(false), [image, setImage] = useState<File | null>(null);
 const [running, setRunning] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [engineNote, setEngineNote] = useState('');
 const [preview, setPreview] = useState('');
 useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
 useEffect(() => { const version = generation; return () => { version.current++; worker.current?.terminate(); clearTimeout(timeout.current); clearTimeout(startupTimeout.current); }; }, []);
 function stopWorker() { worker.current?.terminate(); worker.current = null; clearTimeout(startupTimeout.current); }
 function reset() {
  generation.current++; stopWorker(); clearTimeout(timeout.current);
  setRunning(false); setStatus(''); setError(''); setEngineNote(''); onFeatures(null);
 }
 function process(selectedImage: File | null = image, point?: {x:number;y:number}) {
  if (!selectedImage || !consent || running || disabled) return;
  const image = selectedImage;
  reset(); const attempt = ++generation.current;
  const current = () => generation.current === attempt;
  const armDeadline = () => {
   clearTimeout(timeout.current);
   timeout.current = setTimeout(() => fail('No model download or processing progress for five minutes. Keep this page open near the laptop and try again.'), 300_000);
  };
  const progress = (message: string) => { if (current()) { setStatus(message); armDeadline(); } };
  setRunning(true); setStatus('Starting local DINOv2…');
  let fallbackStarted = false;
  const finish = (features: DinoFeatures) => {
   if (!current()) return;
   generation.current++; stopWorker(); clearTimeout(timeout.current);
   setRunning(false); setStatus('Object features ready.'); onFeatures(features);
  };
  const fail = (message: string) => {
   if (!current()) return;
   generation.current++; stopWorker(); clearTimeout(timeout.current);
   setRunning(false); setStatus(''); setError(message); onFeatures(null);
  };
  const fallback = async (reason: string) => {
   if (!current() || fallbackStarted) return;
   fallbackStarted = true; stopWorker();
   setEngineNote('Using on-device page processing because the worker could not run. The page may pause during inference. Your photo is still never uploaded.');
   progress('Loading the local model in this page…');
   try {
    const { extractObjectFeatures } = await import('@/lib/dino-inference');
    if (!current()) return;
    finish(await extractObjectFeatures(image, progress, () => !current(),point));
   } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 400) : 'Unknown runtime error';
    fail(`On-device processing failed: ${detail}. Worker startup: ${reason.slice(0, 180)}. Check your connection and try a smaller JPEG or PNG.`);
   }
  };
  armDeadline();
  try {
   const instance = new Worker(new URL('../dino.worker.ts', import.meta.url), { type: 'module' }); worker.current = instance;
   startupTimeout.current = setTimeout(() => void fallback('The worker did not start within 12 seconds'), 12_000);
   instance.onerror = event => { event.preventDefault(); void fallback(event.message || 'The browser rejected worker startup'); };
   instance.onmessageerror = () => void fallback('The worker response could not be read');
   instance.onmessage = (event: MessageEvent) => {
    if (!current() || fallbackStarted) return;
    clearTimeout(startupTimeout.current);
    if (event.data.status === 'progress') progress(event.data.message);
    else if (event.data.status === 'complete' && validDinoFeatures(event.data.features)) finish(event.data.features);
    else void fallback(event.data.message || 'Invalid worker output');
   };
   instance.postMessage({ image,point });
  } catch (error) { void fallback(error instanceof Error ? error.message : 'This browser could not create a worker'); }
 }
 return <fieldset className="object-capture" disabled={disabled}>
  <legend>Personal object · DINOv2</legend>
  <p className="form-hint">Use a tightly framed photo in good light. Photos can be replayed; this experimental match does not prove ownership or identity.</p>
  <label className="object-consent"><input type="checkbox" checked={consent} onChange={event => { reset(); setConsent(event.target.checked); }}/><span>Process my photo on this device. Load the model from this app; my photo stays in this browser.</span></label>
  <label>Choose a photo or take one<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!consent || running} onChange={event => {
   reset(); const file = event.target.files?.[0]; setImage(null); setPreview(''); if (!file) return;
   if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { event.target.value = ''; setError('Choose a JPEG, PNG or WebP image under 10 MB.'); return; }
   setImage(file);
   setPreview(URL.createObjectURL(file));
   if (autoProcess&&!isolate) process(file);
  }}/></label>
  {/* Photo preview is a local blob URL, never an image optimizer/server request. */}
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {preview && <button type="button" className="object-isolation-photo" disabled={running||!consent||!isolate} onClick={event=>{if(event.detail===0){process(image,{x:0.5,y:0.5});return;}const img=event.currentTarget.querySelector('img')!;const r=img.getBoundingClientRect();const scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;const x=(event.clientX-r.left-(r.width-w)/2)/w,y=(event.clientY-r.top-(r.height-h)/2)/h;if(x>=0&&x<=1&&y>=0&&y<=1)process(image,{x,y});}}><img className="object-preview" src={preview} alt="Tap the object to isolate it and scan locally"/></button>}
  {isolate&&preview&&!running&&<p className="form-hint">Tap the middle of your object in the photo to remove its background and scan it.</p>}
  {(!isolate && (!autoProcess || (image && !running && (error || !status)))) && <button type="button" className="light-btn" disabled={!consent || !image || running} onClick={() => process()}>{autoProcess ? 'Retry photo scan' : 'Extract object features'}</button>}
  {running && <button type="button" className="light-btn" onClick={reset}>Cancel</button>}
  <p role="status" aria-live="polite" className="form-hint">{status}</p>
  {engineNote && <p className="form-hint">{engineNote}</p>}
  {error && <p role="alert" className="error">{error}</p>}
 </fieldset>;
}
