'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraCaptureProps = {
 onStart: () => void;
 /** Called with the captured photo(s): one photo, or `burst` frames for an angle scan. */
 onCapture: (photos: Blob[]) => void;
 /** Frames to capture in one tap (an angle scan). Default 1. */
 burst?: number;
 /** Time between burst frames. Default 700 ms. */
 burstIntervalMs?: number;
 /** Label of the capture button. */
 captureLabel?: string;
};

/**
 * Live camera preview with a centre guide. Photos are taken fresh; gallery uploads are intentionally unsupported.
 * With `burst`, one tap captures several frames while the user slowly turns the object (an angle scan).
 */
export default function CameraCapture({ onStart, onCapture, burst = 1, burstIntervalMs = 700, captureLabel }: CameraCaptureProps) {
 const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0);
 const [state, setState] = useState<'idle' | 'opening' | 'live' | 'capturing'>('idle');
 const [frame, setFrame] = useState(0), [error, setError] = useState('');
 const stopTracks = useCallback(() => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; }, []);
 const close = useCallback(() => { generation.current++; stopTracks(); setState('idle'); setFrame(0); }, [stopTracks]);
 useEffect(() => {
  const currentStream = stream, version = generation;
  const hidden = () => { if (document.hidden) close(); };
  document.addEventListener('visibilitychange', hidden);
  return () => { version.current++; currentStream.current?.getTracks().forEach(track => track.stop()); currentStream.current = null; document.removeEventListener('visibilitychange', hidden); };
 }, [close]);
 async function open() {
  if (state !== 'idle') return;
  setError(''); onStart(); setState('opening'); const attempt = ++generation.current;
  try {
   if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('Camera access needs HTTPS (or localhost on the laptop) and a supported browser.');
   const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
   if (generation.current !== attempt) { media.getTracks().forEach(track => track.stop()); return; }
   stream.current = media;
   if (!video.current) throw Error('Camera preview is unavailable.');
   video.current.srcObject = media;
   await video.current.play();
   if (generation.current === attempt) setState('live');
  } catch (e) {
   if (generation.current !== attempt) return;
   stopTracks(); setState('idle');
   setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this site, then open the camera again.' : e instanceof Error ? e.message : 'Could not open the camera. Check that another app is not using it.');
  }
 }
 async function grab(source: HTMLVideoElement) {
  const scale = Math.min(1, 1280 / Math.max(source.videoWidth, source.videoHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
  const context = canvas.getContext('2d'); if (!context) throw Error('Camera capture is unavailable.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Could not capture the photo. Try again.')), 'image/jpeg', 0.92));
 }
 async function capture() {
  const source = video.current;
  if (state !== 'live' || !source?.videoWidth || !source.videoHeight) return;
  const attempt = generation.current; setState('capturing'); setError('');
  try {
   const photos: Blob[] = [];
   for (let i = 0; i < burst; i++) {
    if (i) await new Promise(resolve => setTimeout(resolve, burstIntervalMs));
    if (attempt !== generation.current) return;
    setFrame(i + 1);
    photos.push(await grab(source));
   }
   if (attempt !== generation.current) return;
   close(); onCapture(photos);
  } catch (e) { if (attempt === generation.current) { setState('live'); setFrame(0); setError(e instanceof Error ? e.message : 'Could not capture the photo.'); } }
 }
 const label = state === 'opening' ? 'Opening camera…' : state === 'capturing' ? (burst > 1 ? `Keep turning slowly… ${frame}/${burst}` : 'Taking photo…') : captureLabel ?? (burst > 1 ? 'Scan object' : 'Take photo');
 return <div className="tj-camera-capture">
  <div className="tj-camera-frame" hidden={state === 'idle'}>
   <video ref={video} autoPlay muted playsInline className="tj-object-preview" aria-label="Live object camera preview"/>
   <span className="tj-camera-guide" aria-hidden="true"/>
  </div>
  {state !== 'idle' && <p className="tj-form-hint">{burst > 1 ? 'Hold your object inside the circle. After you tap Scan, turn it slowly for about two seconds.' : 'Hold your object inside the circle, then take the photo.'}</p>}
  {state === 'idle' ? <button type="button" className="tj-light-btn" onClick={() => void open()}>Open camera</button> : <div className="tj-camera-actions"><button type="button" className="tj-primary" disabled={state !== 'live'} onClick={() => void capture()}>{label}</button><button type="button" className="tj-light-btn" onClick={close}>Close camera</button></div>}
  {error && <p className="tj-error" role="alert">{error}</p>}
 </div>;
}
