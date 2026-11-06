import { validDinoFeatures, type DinoFeatures } from '@tijori/core/dino';
import { assetBaseUrl, resolveAssetBase } from './assets.ts';
import type { ObjectBrush, ObjectPoint, ObjectScanResult } from './object-geometry.ts';

export type ExtractOptions = {
 /** Tap point (0–1 relative coordinates) to isolate the object with SlimSAM before DINOv2. */
 point?: ObjectPoint;
 onProgress?: (message: string) => void;
 /** Called once if the worker cannot run and inference falls back to the page (which may pause the UI). */
 onFallback?: (reason: string) => void;
 signal?: AbortSignal;
 /** Asset base URL for this call. Defaults to configureAssets() / '/tijori-assets/'. */
 assetBaseUrl?: string;
 /** Create the inference worker yourself (e.g. Vite `?worker` imports). Return null to skip the worker. */
 workerFactory?: () => Worker | null;
 /** Fall back to the page when the worker has not answered within this time. Default 12 s. */
 workerStartupTimeoutMs?: number;
 /** Fail when neither download nor processing makes progress for this long. Default 5 minutes. */
 stallTimeoutMs?: number;
};
const defaultWorker = () => new Worker(new URL('./dino.worker.ts', import.meta.url), { type: 'module' });

/**
 * Extract DINOv2 object features on this device: in a module worker when possible, otherwise in the page.
 * The photo never leaves the browser. Rejects when aborted, on stalls and on runtime failures.
 */
export function extractObjectFeatures(image: Blob, options: ExtractOptions = {}): Promise<DinoFeatures> {
 const base = resolveAssetBase(options.assetBaseUrl ?? assetBaseUrl());
 const startup = options.workerStartupTimeoutMs ?? 12_000, stall = options.stallTimeoutMs ?? 300_000;
 return new Promise<DinoFeatures>((resolve, reject) => {
  let worker: Worker | null = null, done = false, fallbackStarted = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined, startupTimer: ReturnType<typeof setTimeout> | undefined;
  const stopWorker = () => { worker?.terminate(); worker = null; clearTimeout(startupTimer); };
  const settle = (error?: Error, features?: DinoFeatures) => {
   if (done) return;
   done = true; stopWorker(); clearTimeout(stallTimer); options.signal?.removeEventListener('abort', abort);
   if (error) reject(error); else resolve(features!);
  };
  const abort = () => settle(new DOMException('Image processing cancelled.', 'AbortError') as Error);
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => settle(new Error('No model download or processing progress for five minutes. Keep this page open and try again.')), stall); };
  const progress = (message: string) => { if (!done) { options.onProgress?.(message); armStall(); } };
  const fallback = async (reason: string) => {
   if (done || fallbackStarted) return;
   fallbackStarted = true; stopWorker();
   options.onFallback?.(reason);
   progress('Loading the local model in this page…');
   try {
    const { runDinoInference } = await import('./dino-inference.ts');
    if (done) return;
    settle(undefined, await runDinoInference(image, progress, () => done, options.point, base));
   } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 400) : 'Unknown runtime error';
    settle(new Error(`On-device processing failed: ${detail}. Worker startup: ${reason.slice(0, 180)}. Check your connection and retake the photo.`));
   }
  };
  if (options.signal?.aborted) { abort(); return; }
  options.signal?.addEventListener('abort', abort, { once: true });
  armStall();
  try {
   worker = (options.workerFactory ?? defaultWorker)();
   if (!worker) { void fallback('Worker disabled by workerFactory'); return; }
   startupTimer = setTimeout(() => void fallback(`The worker did not start within ${Math.round(startup / 1000)} seconds`), startup);
   worker.onerror = event => { event.preventDefault(); void fallback(event.message || 'The browser rejected worker startup'); };
   worker.onmessageerror = () => void fallback('The worker response could not be read');
   worker.onmessage = (event: MessageEvent) => {
    if (done || fallbackStarted) return;
    clearTimeout(startupTimer);
    if (event.data.status === 'progress') progress(event.data.message);
    else if (event.data.status === 'complete' && validDinoFeatures(event.data.features)) settle(undefined, event.data.features);
    else void fallback(event.data.message || 'Invalid worker output');
   };
   worker.postMessage({ image, point: options.point, assetBaseUrl: base });
  } catch (error) { void fallback(error instanceof Error ? error.message : 'This browser could not create a worker'); }
 });
}

export type DescriptorOptions = Omit<ExtractOptions, 'point'> & {
 /** Where the object is in each photo (0–1). Default: the centre. */
 point?: ObjectPoint;
 /** Called after each photo with its index and result. */
 onResult?: (index: number, result: ObjectScanResult) => void;
 /** The user's brushing over the object (applied to every photo, e.g. all angles of a scan). Default: the centre. */
 brush?: ObjectBrush;
};
const validResult = (value: unknown): value is ObjectScanResult => {
 const r = value as ObjectScanResult;
 return !!r && !!r.descriptor && Array.isArray(r.descriptor.cls) && r.descriptor.cls.length === 384 && Array.isArray(r.descriptor.fg) && r.descriptor.fg.length === 384 && typeof r.objectFraction === 'number';
};
/**
 * Scanner v2: isolate the object (at the centre by default) in each photo and compute its descriptor, on this
 * device. Photos are processed in order by one worker, so the models load once for a whole sign-up scan.
 * Rejects with a clear message when no object is found; photos never leave the browser.
 */
export function extractObjectDescriptors(images: Blob[], options: DescriptorOptions = {}): Promise<ObjectScanResult[]> {
 const base = resolveAssetBase(options.assetBaseUrl ?? assetBaseUrl());
 const startup = options.workerStartupTimeoutMs ?? 12_000, stall = options.stallTimeoutMs ?? 300_000;
 return new Promise<ObjectScanResult[]>((resolve, reject) => {
  const results: ObjectScanResult[] = [];
  let worker: Worker | null = null, done = false, inPage = false, started = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined, startupTimer: ReturnType<typeof setTimeout> | undefined;
  const stopWorker = () => { worker?.terminate(); worker = null; clearTimeout(startupTimer); };
  const settle = (error?: Error) => {
   if (done) return;
   done = true; stopWorker(); clearTimeout(stallTimer); options.signal?.removeEventListener('abort', abort);
   if (error) reject(error); else resolve(results);
  };
  const abort = () => settle(new DOMException('Image processing cancelled.', 'AbortError') as Error);
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => settle(new Error('No model download or processing progress for five minutes. Keep this page open and try again.')), stall); };
  const progress = (message: string) => { if (!done) { options.onProgress?.(message); armStall(); } };
  const accept = (result: ObjectScanResult) => { results.push(result); options.onResult?.(results.length - 1, result); };
  const runInPage = async (reason: string) => {
   if (done || inPage) return;
   inPage = true; stopWorker(); options.onFallback?.(reason);
   try {
    const { runObjectDescriptor } = await import('./dino-inference.ts');
    while (!done && results.length < images.length) accept(await runObjectDescriptor(images[results.length], progress, () => done, options.point, base, options.brush));
    settle();
   } catch (error) { settle(error instanceof Error ? error : new Error('On-device processing failed.')); }
  };
  const next = () => {
   if (done) return;
   if (results.length === images.length) { settle(); return; }
   worker!.postMessage({ image: images[results.length], point: options.point, assetBaseUrl: base, mode: 'descriptor', brush: options.brush });
  };
  if (!images.length) { resolve([]); return; }
  if (options.signal?.aborted) { abort(); return; }
  options.signal?.addEventListener('abort', abort, { once: true });
  armStall();
  try {
   worker = (options.workerFactory ?? defaultWorker)();
   if (!worker) { void runInPage('Worker disabled by workerFactory'); return; }
   startupTimer = setTimeout(() => void runInPage(`The worker did not start within ${Math.round(startup / 1000)} seconds`), startup);
   worker.onerror = event => { event.preventDefault(); void runInPage(event.message || 'The browser rejected worker startup'); };
   worker.onmessageerror = () => void runInPage('The worker response could not be read');
   worker.onmessage = (event: MessageEvent) => {
    if (done || inPage) return;
    if (!started) { started = true; clearTimeout(startupTimer); }
    if (event.data.status === 'progress') progress(event.data.message);
    else if (event.data.status === 'complete' && validResult(event.data.result)) { accept(event.data.result); next(); }
    // A clear "no object" answer is the user's to fix (retake), not a reason to switch runtimes.
    else if (event.data.status === 'error' && typeof event.data.message === 'string' && event.data.message.startsWith('No object found')) settle(new Error(event.data.message));
    else void runInPage(event.data.message || 'Invalid worker output');
   };
   next();
  } catch (error) { void runInPage(error instanceof Error ? error.message : 'This browser could not create a worker'); }
 });
}
