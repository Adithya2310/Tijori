'use client';
import { useEffect, useRef, useState } from 'react';
import { validDinoFeatures, type DinoFeatures } from '@/lib/dino';
import CameraCapture from './CameraCapture';

export default function ObjectCapture({ disabled, onFeatures, autoProcess = false, isolate=false, preprocessVersion=2 }: { disabled: boolean; autoProcess?: boolean; isolate?:boolean; preprocessVersion?:1|2; onFeatures: (features: DinoFeatures | null) => void }) {
 const worker = useRef<Worker | null>(null);
 const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const startupTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const generation = useRef(0);
 const [consent, setConsent] = useState(false), [image, setImage] = useState<Blob | null>(null);
 const [running, setRunning] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [engineNote, setEngineNote] = useState('');
 const [preview, setPreview] = useState('');
 const [aspect, setAspect] = useState<string>('');
 const [box, setBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
 const [liveBox, setLiveBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
 const dragStart = useRef<{ x: number; y: number } | null>(null);

 useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
 useEffect(() => { const version = generation; return () => { version.current++; worker.current?.terminate(); clearTimeout(timeout.current); clearTimeout(startupTimeout.current); }; }, []);
 function stopWorker() { worker.current?.terminate(); worker.current = null; clearTimeout(startupTimeout.current); }
 function reset() {
  generation.current++; stopWorker(); clearTimeout(timeout.current);
  dragStart.current = null; setBox(null); setLiveBox(null);
  setRunning(false); setStatus(''); setError(''); setEngineNote(''); onFeatures(null);
 }
 function process(selectedImage: Blob | null = image, point?: {x:number;y:number}, selectionBox?: {x1:number;y1:number;x2:number;y2:number}) {
  if (!selectedImage || !consent || running || disabled) return;
  const image = selectedImage;
  reset(); const attempt = ++generation.current;
  if (selectionBox) setBox(selectionBox);
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
    finish(await extractObjectFeatures(image, progress, () => !current(), point, preprocessVersion, selectionBox));
   } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 400) : 'Unknown runtime error';
    fail(`On-device processing failed: ${detail}. Worker startup: ${reason.slice(0, 180)}. Check your connection and retake the photo.`);
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
   instance.postMessage({ image, point, preprocessVersion, box: selectionBox });
  } catch (error) { void fallback(error instanceof Error ? error.message : 'This browser could not create a worker'); }
 }

 function getNormalizedCoords(e: React.PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const r = e.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  return { x, y };
 }

 function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
  if (running || !consent || !isolate || disabled) return;
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  const coords = getNormalizedCoords(e);
  dragStart.current = coords;
  setLiveBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
 }

 function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
  if (!dragStart.current) return;
  const coords = getNormalizedCoords(e);
  setLiveBox({
   x1: Math.min(dragStart.current.x, coords.x),
   y1: Math.min(dragStart.current.y, coords.y),
   x2: Math.max(dragStart.current.x, coords.x),
   y2: Math.max(dragStart.current.y, coords.y),
  });
 }

 function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
  if (!dragStart.current) return;
  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  const coords = getNormalizedCoords(e);
  const start = dragStart.current;
  dragStart.current = null;
  const w = Math.abs(coords.x - start.x);
  const h = Math.abs(coords.y - start.y);
  if (w < 0.03 && h < 0.03) {
   setLiveBox(null);
   setBox(null);
   process(image, { x: start.x, y: start.y });
  } else {
   const b = {
    x1: Math.min(start.x, coords.x),
    y1: Math.min(start.y, coords.y),
    x2: Math.max(start.x, coords.x),
    y2: Math.max(start.y, coords.y),
   };
   setLiveBox(null);
   setBox(b);
   process(image, { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }, b);
  }
 }

 const displayBox = liveBox ?? box;

 return <fieldset className="object-capture" disabled={disabled}>
  <legend>Personal object · DINOv2</legend>
  <p className="form-hint">Use a tightly framed photo in good light. Photos can be replayed; this experimental match does not prove ownership or identity.</p>
  <label className="object-consent"><input type="checkbox" checked={consent} onChange={event => { reset(); setConsent(event.target.checked); }}/><span>Process my photo on this device. Load the model from this app; my photo stays in this browser.</span></label>
  <p className="form-hint">Take a fresh photo with your camera. Gallery selection and image-file uploads are not available.</p>
  {consent && !disabled && !running && <CameraCapture onStart={() => { reset(); setImage(null); setPreview(''); setAspect(''); }} onCapture={photo => {
   setImage(photo); setPreview(URL.createObjectURL(photo)); setBox(null); setLiveBox(null);
   if (autoProcess && !isolate) process(photo);
  }}/>}
  {/* Photo preview is a local blob URL, never an image optimizer/server request. */}
  {preview && (
   <div
    role="button"
    tabIndex={isolate && !running && consent && !disabled ? 0 : -1}
    aria-label="Drag a box around the object to select and isolate it from the background"
    className="object-isolation-wrapper"
    style={{ aspectRatio: aspect || 'auto' }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onKeyDown={e => {
     if ((e.key === 'Enter' || e.key === ' ') && isolate && !running && consent && !disabled) {
      e.preventDefault();
      process(image, { x: 0.5, y: 0.5 });
     }
    }}
   >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
     className="object-preview"
     src={preview}
     alt="Drag a box around the object to isolate it"
     draggable={false}
     onLoad={e => {
      const img = e.currentTarget;
      if (img.naturalWidth && img.naturalHeight) {
       setAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
      }
     }}
    />
    {displayBox && (
     <div
      className="object-selection-box"
      style={{
       left: `${displayBox.x1 * 100}%`,
       top: `${displayBox.y1 * 100}%`,
       width: `${(displayBox.x2 - displayBox.x1) * 100}%`,
       height: `${(displayBox.y2 - displayBox.y1) * 100}%`,
      }}
     >
      <span className="object-selection-corner object-selection-tl" />
      <span className="object-selection-corner object-selection-tr" />
      <span className="object-selection-corner object-selection-bl" />
      <span className="object-selection-corner object-selection-br" />
      <span className="object-selection-badge">{liveBox ? 'Selecting…' : 'Selected'}</span>
     </div>
    )}
   </div>
  )}
  {isolate && preview && !running && (
   <p className="form-hint">
    Drag a box around your object to select and isolate it from the background (or tap the object).
   </p>
  )}
  {(!isolate && (!autoProcess || (image && !running && (error || !status)))) && <button type="button" className="light-btn" disabled={!consent || !image || running} onClick={() => process()}>{autoProcess ? 'Retry photo scan' : 'Extract object features'}</button>}
  {running && <button type="button" className="light-btn" onClick={reset}>Cancel</button>}
  <p role="status" aria-live="polite" className="form-hint">{status}</p>
  {engineNote && <p className="form-hint">{engineNote}</p>}
  {error && <p role="alert" className="error">{error}</p>}
 </fieldset>;
}
