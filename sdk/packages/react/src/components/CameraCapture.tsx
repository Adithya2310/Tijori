'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Live camera preview and capture. Photos are taken fresh; gallery uploads are intentionally unsupported. */
export default function CameraCapture({ onStart, onCapture }: { onStart: () => void; onCapture: (photo: Blob) => void }) {
 const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0);
 const [state, setState] = useState<'idle' | 'opening' | 'live' | 'capturing'>('idle');
 const [error, setError] = useState('');
 const stopTracks = useCallback(() => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; }, []);
 const close = useCallback(() => { generation.current++; stopTracks(); setState('idle'); }, [stopTracks]);
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
 async function capture() {
  const source = video.current;
  if (state !== 'live' || !source?.videoWidth || !source.videoHeight) return;
  const attempt = generation.current; setState('capturing'); setError('');
  try {
   const scale = Math.min(1, 1280 / Math.max(source.videoWidth, source.videoHeight));
   const canvas = document.createElement('canvas'); canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
   const context = canvas.getContext('2d'); if (!context) throw Error('Camera capture is unavailable.');
   context.drawImage(source, 0, 0, canvas.width, canvas.height);
   const photo = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Could not capture the photo. Try again.')), 'image/jpeg', 0.92));
   if (attempt !== generation.current) return;
   close(); onCapture(photo);
  } catch (e) { if (attempt === generation.current) { setState('live'); setError(e instanceof Error ? e.message : 'Could not capture the photo.'); } }
 }
 return <div className="tj-camera-capture">
  <video ref={video} autoPlay muted playsInline hidden={state === 'idle'} className="tj-object-preview" aria-label="Live object camera preview"/>
  {state === 'idle' ? <button type="button" className="tj-light-btn" onClick={() => void open()}>Open camera</button> : <div className="tj-camera-actions"><button type="button" className="tj-primary" disabled={state !== 'live'} onClick={() => void capture()}>{state === 'opening' ? 'Opening camera…' : state === 'capturing' ? 'Taking photo…' : 'Take photo'}</button><button type="button" className="tj-light-btn" onClick={close}>Close camera</button></div>}
  {error && <p className="tj-error" role="alert">{error}</p>}
 </div>;
}
