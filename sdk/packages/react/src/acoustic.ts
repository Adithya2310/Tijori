'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAcousticModem, type AcousticModem } from '@tijori/client';
import { validAcousticCode } from '@tijori/core/acoustic-code';

export type AcousticMode = 'idle' | 'broadcasting' | 'listening';
/** Ignore a decoded code that was just tried (the modem decodes every repeated frame). */
const RETRY_AFTER_MS = 3000;

function friendly(error: unknown) {
 const name = error instanceof DOMException ? error.name : '';
 if (name === 'NotAllowedError' || name === 'SecurityError') return Error('Allow microphone access for this site to join the payment check.');
 if (name === 'NotFoundError') return Error('No microphone was found on this device.');
 return error instanceof Error ? error : Error('Audio could not start. Check the browser permissions.');
}

/**
 * The acoustic modem (ggwave) for one component: play a 6-character code in a loop, or listen for one. The modem is
 * shared by the page, so only one broadcast or listener runs at a time. Audio stops on unmount.
 */
export function useAcoustic() {
 const modem = useRef<AcousticModem | null>(null), generation = useRef(0);
 const [ready, setReady] = useState(false), [mode, setMode] = useState<AcousticMode>('idle'), [level, setLevel] = useState(0), [loadError, setLoadError] = useState('');
 useEffect(() => {
  let live = true;
  const counter = generation, loaded = modem;
  loadAcousticModem().then(value => { if (live) { loaded.current = value; setReady(true); } }, () => { if (live) setLoadError('Could not load the acoustic modem. Reload to try again.'); });
  return () => { live = false; counter.current++; loaded.current?.stopChallengeTone(); loaded.current?.stopAcousticListener(); };
 }, []);
 const stop = useCallback(() => {
  generation.current++;
  modem.current?.stopChallengeTone(); modem.current?.stopAcousticListener();
  setMode('idle'); setLevel(0);
 }, []);
 /** Call first in a click handler, before any network request: mobile browsers start audio only from a user gesture. */
 const prime = useCallback(async () => {
  if (!window.isSecureContext) throw Error('The payment check uses the microphone, which needs HTTPS on every device (localhost also works on this computer).');
  if (!modem.current) throw Error(loadError || 'The acoustic modem is still loading. Try again in a moment.');
  await modem.current.initModem();
 }, [loadError]);
 /** Play `code` over the speaker, repeating with short pauses until `until` (epoch ms) or stop(). */
 const broadcast = useCallback(async (code: string, options: { ultrasound: boolean; until: number }) => {
  const m = modem.current;
  if (!m) throw Error('The acoustic modem is still loading.');
  const attempt = ++generation.current;
  m.stopAcousticListener(); setMode('broadcasting');
  try {
   while (attempt === generation.current && Date.now() < options.until) {
    await m.playChallengeTone(code, options.ultrasound);
    await new Promise(resolve => setTimeout(resolve, 500));
   }
  } finally { if (attempt === generation.current) setMode('idle'); }
 }, []);
 /**
  * Listen for codes. `onCode` runs for each decoded code (one at a time); resolve true to stop listening, false to
  * keep listening (for example after a wrong code). Resolves once the microphone is on.
  */
 const listen = useCallback(async (onCode: (code: string) => Promise<boolean>) => {
  const m = modem.current;
  if (!m) throw Error('The acoustic modem is still loading.');
  const attempt = ++generation.current, tried = new Map<string, number>();
  let busy = false;
  m.stopChallengeTone(); setMode('listening');
  try {
   const started = await m.startAcousticListener(async text => {
    const code = text.trim();
    if (attempt !== generation.current || busy || !validAcousticCode(code) || Date.now() - (tried.get(code) ?? 0) < RETRY_AFTER_MS) return;
    busy = true; tried.set(code, Date.now());
    try { if (await onCode(code) && attempt === generation.current) stop(); } finally { busy = false; }
   }, value => { if (attempt === generation.current) setLevel(value); });
   if (!started && attempt === generation.current) setMode('idle');
  } catch (error) {
   if (attempt === generation.current) { setMode('idle'); setLevel(0); }
   throw friendly(error);
  }
 }, [stop]);
 return { ready, mode, level, loadError, prime, broadcast, listen, stop };
}
