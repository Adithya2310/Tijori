'use client';
import { useEffect, useRef, useState } from 'react';
import { extractObjectDescriptors, type ObjectBrush, type ObjectScanResult } from '@tijori/client';
import CameraCapture from './CameraCapture.tsx';
import BrushPad from './BrushPad.tsx';

const CONSENT_KEY = 'tj-object-consent';
const readConsent = () => { try { return sessionStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; } };
const SCAN_FRAMES = 3;

export type ObjectCaptureProps = {
 /** 'scan': one tap captures several angles (sign-up). 'photo': one photo (login, approvals). */
 mode: 'scan' | 'photo';
 disabled: boolean;
 /** Descriptors of the captured views, or null while capturing again / after an error. */
 onResult: (results: ObjectScanResult[] | null) => void;
};

/**
 * Scanner v2 capture: camera, on-device object isolation and DINOv2 descriptors. The object inside the guide circle
 * is found automatically; if the cut-out is wrong, the user brushes over the object and every photo is redone with
 * that brushing. Photos never leave the browser; only compact descriptors are returned.
 */
export default function ObjectCapture({ mode, disabled, onResult }: ObjectCaptureProps) {
 const controller = useRef<AbortController | null>(null);
 const [consent, setConsent] = useState(readConsent), [photos, setPhotos] = useState<Blob[]>([]), [cutouts, setCutouts] = useState<string[]>([]);
 const [brushing, setBrushing] = useState(false), [brushed, setBrushed] = useState(false);
 const [running, setRunning] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [engineNote, setEngineNote] = useState('');
 useEffect(() => () => cutouts.forEach(url => URL.revokeObjectURL(url)), [cutouts]);
 useEffect(() => () => controller.current?.abort(), []);
 function reset() {
  controller.current?.abort(); controller.current = null;
  setRunning(false); setStatus(''); setError(''); setEngineNote(''); setCutouts([]); onResult(null);
 }
 function giveConsent(value: boolean) {
  reset(); setConsent(value);
  try { if (value) sessionStorage.setItem(CONSENT_KEY, '1'); else sessionStorage.removeItem(CONSENT_KEY); } catch { /* storage disabled */ }
 }
 function process(images: Blob[], brush?: ObjectBrush) {
  if (!consent || disabled || !images.length) return;
  reset(); setPhotos(images); setBrushing(false); setBrushed(!!brush);
  const attempt = new AbortController(); controller.current = attempt;
  const current = () => controller.current === attempt;
  setRunning(true); setStatus(brush ? 'Using your brushing…' : mode === 'scan' ? 'Reading your object from each angle…' : 'Reading your object…');
  extractObjectDescriptors(images, {
   signal: attempt.signal, brush,
   onProgress: message => { if (current()) setStatus(message); },
   onResult: index => { if (current() && images.length > 1) setStatus(`Angle ${index + 1} of ${images.length} ready.`); },
   onFallback: () => { if (current()) setEngineNote('Using on-device page processing because the worker could not run. The page may pause briefly. Your photos are still never uploaded.'); },
  }).then(results => {
   if (!current()) return;
   controller.current = null; setRunning(false);
   setCutouts(results.flatMap(result => (result.preview ? [URL.createObjectURL(result.preview)] : [])));
   setStatus(mode === 'scan' ? 'Object scanned. Check the cut-outs below.' : 'Object ready. Check the cut-out below.'); onResult(results);
  }, (failure: unknown) => {
   if (!current()) return;
   controller.current = null; setRunning(false); setStatus(''); setError(failure instanceof Error ? failure.message : 'On-device processing failed.'); onResult(null);
  });
 }
 const canBrush = photos.length > 0 && !running && !brushing && !disabled;
 return <fieldset className="tj-object-capture" disabled={disabled}>
  <legend>{mode === 'scan' ? 'Scan your object' : 'Show your object'}</legend>
  {!consent && <label className="tj-object-consent"><input type="checkbox" checked={consent} onChange={event => giveConsent(event.target.checked)}/><span>Process my photos on this device. Only compact object features leave this browser, never the photos.</span></label>}
  {consent && !disabled && !running && !brushing && <CameraCapture burst={mode === 'scan' ? SCAN_FRAMES : 1} onStart={() => { reset(); setPhotos([]); setBrushed(false); }} onCapture={images => process(images)}/>}
  {brushing && photos[0] && <BrushPad photo={photos[0]} onCancel={() => setBrushing(false)} onDone={brush => process(photos, brush)}/>}
  {/* Cut-outs are local blob URLs, never an image optimizer/server request. */}
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {cutouts.length > 0 && !brushing && <div className="tj-scan-thumbs">{cutouts.map((url, i) => <img key={url} className="tj-scan-thumb" src={url} alt={mode === 'scan' ? `What was scanned, angle ${i + 1}` : 'What was scanned'}/>)}</div>}
  {canBrush && <button type="button" className="tj-light-btn" onClick={() => setBrushing(true)}>{error || !cutouts.length ? 'Brush over your object instead' : brushed ? 'Brush again' : 'Not your object? Brush over it'}</button>}
  {running && <button type="button" className="tj-light-btn" onClick={reset}>Cancel</button>}
  <p role="status" aria-live="polite" className="tj-form-hint">{status}</p>
  {engineNote && <p className="tj-form-hint">{engineNote}</p>}
  {error && <p role="alert" className="tj-error">{error}</p>}
 </fieldset>;
}
