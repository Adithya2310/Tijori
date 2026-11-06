'use client';
import { useEffect, useRef, useState } from 'react';
import type { DinoFeatures } from '@tijori/core/dino';
import { extractObjectFeatures } from '@tijori/client';
import CameraCapture from './CameraCapture.tsx';

/** Camera capture plus on-device DINOv2 feature extraction (optionally isolating the tapped object first). */
export default function ObjectCapture({ disabled, onFeatures, autoProcess = false, isolate=false }: { disabled: boolean; autoProcess?: boolean; isolate?:boolean; onFeatures: (features: DinoFeatures | null) => void }) {
 const controller = useRef<AbortController | null>(null);
 const [consent, setConsent] = useState(false), [image, setImage] = useState<Blob | null>(null);
 const [running, setRunning] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [engineNote, setEngineNote] = useState('');
 const [preview, setPreview] = useState('');
 useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
 useEffect(() => () => controller.current?.abort(), []);
 function reset() {
  controller.current?.abort(); controller.current = null;
  setRunning(false); setStatus(''); setError(''); setEngineNote(''); onFeatures(null);
 }
 function process(selectedImage: Blob | null = image, point?: {x:number;y:number}) {
  if (!selectedImage || !consent || running || disabled) return;
  reset();
  const attempt = new AbortController(); controller.current = attempt;
  const current = () => controller.current === attempt;
  setRunning(true); setStatus('Starting local DINOv2…');
  extractObjectFeatures(selectedImage, {
   point, signal: attempt.signal,
   onProgress: message => { if (current()) setStatus(message); },
   onFallback: () => { if (current()) setEngineNote('Using on-device page processing because the worker could not run. The page may pause during inference. Your photo is still never uploaded.'); },
  }).then(features => {
   if (!current()) return;
   controller.current = null; setRunning(false); setStatus('Object features ready.'); onFeatures(features);
  }, (failure: unknown) => {
   if (!current()) return;
   controller.current = null; setRunning(false); setStatus(''); setError(failure instanceof Error ? failure.message : 'On-device processing failed.'); onFeatures(null);
  });
 }
 return <fieldset className="tj-object-capture" disabled={disabled}>
  <legend>Personal object · DINOv2</legend>
  <p className="tj-form-hint">Use a tightly framed photo in good light. Photos can be replayed; this experimental match does not prove ownership or identity.</p>
  <label className="tj-object-consent"><input type="checkbox" checked={consent} onChange={event => { reset(); setConsent(event.target.checked); }}/><span>Process my photo on this device. Load the model from this app; my photo stays in this browser.</span></label>
  <p className="tj-form-hint">Take a fresh photo with your camera. Gallery selection and image-file uploads are not available.</p>
  {consent && !disabled && !running && <CameraCapture onStart={() => { reset(); setImage(null); setPreview(''); }} onCapture={photo => {
   setImage(photo); setPreview(URL.createObjectURL(photo));
   if (autoProcess && !isolate) process(photo);
  }}/>}
  {/* Photo preview is a local blob URL, never an image optimizer/server request. */}
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {preview && <button type="button" className="tj-object-isolation-photo" disabled={running||!consent||!isolate} onClick={event=>{if(event.detail===0){process(image,{x:0.5,y:0.5});return;}const img=event.currentTarget.querySelector('img')!;const r=img.getBoundingClientRect();const scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;const x=(event.clientX-r.left-(r.width-w)/2)/w,y=(event.clientY-r.top-(r.height-h)/2)/h;if(x>=0&&x<=1&&y>=0&&y<=1)process(image,{x,y});}}><img className="tj-object-preview" src={preview} alt="Tap the object to isolate it and scan locally"/></button>}
  {isolate&&preview&&!running&&<p className="tj-form-hint">Tap the middle of your object in the photo to remove its background and scan it.</p>}
  {(!isolate && (!autoProcess || (image && !running && (error || !status)))) && <button type="button" className="tj-light-btn" disabled={!consent || !image || running} onClick={() => process()}>{autoProcess ? 'Retry photo scan' : 'Extract object features'}</button>}
  {running && <button type="button" className="tj-light-btn" onClick={reset}>Cancel</button>}
  <p role="status" aria-live="polite" className="tj-form-hint">{status}</p>
  {engineNote && <p className="tj-form-hint">{engineNote}</p>}
  {error && <p role="alert" className="tj-error">{error}</p>}
 </fieldset>;
}
