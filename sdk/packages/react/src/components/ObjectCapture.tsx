'use client';
import { useEffect, useRef, useState } from 'react';
import { extractObjectDescriptors, type ObjectScanResult } from '@tijori/client';
import CameraCapture from './CameraCapture.tsx';

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
 * Scanner v2 capture: camera, on-device object isolation (the object at the centre) and DINOv2 descriptors.
 * Photos never leave the browser; only compact descriptors are returned.
 */
export default function ObjectCapture({ mode, disabled, onResult }: ObjectCaptureProps) {
 const controller = useRef<AbortController | null>(null);
 const [consent, setConsent] = useState(readConsent), [previews, setPreviews] = useState<string[]>([]);
 const [running, setRunning] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [engineNote, setEngineNote] = useState('');
 useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
 useEffect(() => () => controller.current?.abort(), []);
 function reset() {
  controller.current?.abort(); controller.current = null;
  setRunning(false); setStatus(''); setError(''); setEngineNote(''); onResult(null);
 }
 function giveConsent(value: boolean) {
  reset(); setConsent(value);
  try { if (value) sessionStorage.setItem(CONSENT_KEY, '1'); else sessionStorage.removeItem(CONSENT_KEY); } catch { /* storage disabled */ }
 }
 function process(photos: Blob[]) {
  if (!consent || disabled || !photos.length) return;
  reset();
  setPreviews(photos.map(photo => URL.createObjectURL(photo)));
  const attempt = new AbortController(); controller.current = attempt;
  const current = () => controller.current === attempt;
  setRunning(true); setStatus(mode === 'scan' ? 'Reading your object from each angle…' : 'Reading your object…');
  extractObjectDescriptors(photos, {
   signal: attempt.signal,
   onProgress: message => { if (current()) setStatus(message); },
   onResult: index => { if (current() && photos.length > 1) setStatus(`Angle ${index + 1} of ${photos.length} ready.`); },
   onFallback: () => { if (current()) setEngineNote('Using on-device page processing because the worker could not run. The page may pause briefly. Your photos are still never uploaded.'); },
  }).then(results => {
   if (!current()) return;
   controller.current = null; setRunning(false); setStatus(mode === 'scan' ? 'Object scanned.' : 'Object ready.'); onResult(results);
  }, (failure: unknown) => {
   if (!current()) return;
   controller.current = null; setRunning(false); setStatus(''); setError(failure instanceof Error ? failure.message : 'On-device processing failed.'); onResult(null);
  });
 }
 return <fieldset className="tj-object-capture" disabled={disabled}>
  <legend>{mode === 'scan' ? 'Scan your object' : 'Show your object'}</legend>
  {!consent && <label className="tj-object-consent"><input type="checkbox" checked={consent} onChange={event => giveConsent(event.target.checked)}/><span>Process my photos on this device. Only compact object features leave this browser, never the photos.</span></label>}
  {consent && !disabled && !running && <CameraCapture burst={mode === 'scan' ? SCAN_FRAMES : 1} onStart={() => { reset(); setPreviews([]); }} onCapture={process}/>}
  {/* Previews are local blob URLs, never an image optimizer/server request. */}
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {previews.length > 0 && <div className="tj-scan-thumbs">{previews.map((url, i) => <img key={url} className="tj-scan-thumb" src={url} alt={mode === 'scan' ? `Angle ${i + 1}` : 'Your object'}/>)}</div>}
  {running && <button type="button" className="tj-light-btn" onClick={reset}>Cancel</button>}
  <p role="status" aria-live="polite" className="tj-form-hint">{status}</p>
  {engineNote && <p className="tj-form-hint">{engineNote}</p>}
  {error && <p role="alert" className="tj-error">{error}</p>}
 </fieldset>;
}
