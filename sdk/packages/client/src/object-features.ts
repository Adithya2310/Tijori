import { validDinoFeatures, type DinoFeatures } from '@tijori/core/dino';
import { assetBaseUrl, objectAccelerator, resolveAssetBase } from './assets.ts';
import type { ObjectBrush, ObjectPoint, ObjectScanResult } from './object-geometry.ts';
import type { ObjectAccelerator, RuntimeChoice } from './on-device-runtime.ts';
export type { ObjectAccelerator, RuntimeChoice } from './on-device-runtime.ts';

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
 /** 'wasm' (CPU only) or 'webgpu' (object isolation on the GPU when it works). Default: configureAssets(), else 'wasm'. The first call in a page decides. */
 accelerator?: ObjectAccelerator;
};
const validResult = (value: unknown): value is ObjectScanResult => {
 const r = value as ObjectScanResult;
 return !!r && !!r.descriptor && Array.isArray(r.descriptor.cls) && r.descriptor.cls.length === 384 && Array.isArray(r.descriptor.fg) && r.descriptor.fg.length === 384 && typeof r.objectFraction === 'number';
};

// One long-lived worker per page (per worker factory): the models load once and stay ready between scans, retakes
// and logins. Jobs carry ids; the worker runs them one at a time.
type Reply = { id?: number; status: 'progress' | 'complete' | 'error'; message?: string; result?: unknown; runtime?: RuntimeChoice };
type Job = { onProgress: (message: string) => void; onReply: (reply: Reply) => void; onBroken: (reason: string) => void };
type Engine = {
 worker: Worker; jobs: Map<number, Job>; alive: boolean; broken?: string; startup: ReturnType<typeof setTimeout>;
 preload?: Promise<RuntimeChoice | null>; ready?: RuntimeChoice; preloadListeners: Set<(message: string) => void>;
};
type Factory = () => Worker | null;
/** A string records why this page cannot use a worker (then inference runs in the page). */
const engines = new Map<Factory, Engine | string>();
let nextJob = 1;
function breakEngine(factory: Factory, engine: Engine, reason: string, permanent: boolean) {
 if (engine.broken) return;
 engine.broken = reason; clearTimeout(engine.startup); engine.worker.terminate();
 if (engines.get(factory) === engine) { if (permanent) engines.set(factory, reason); else engines.delete(factory); }
 const jobs = [...engine.jobs.values()]; engine.jobs.clear();
 for (const job of jobs) job.onBroken(reason);
}
function engineFor(factory: Factory, startupMs: number): Engine | string {
 const existing = engines.get(factory);
 if (existing) return existing;
 let worker: Worker | null;
 try { worker = factory(); } catch (error) { worker = null; engines.set(factory, error instanceof Error ? error.message : 'This browser could not create a worker'); }
 if (!worker) { if (!engines.has(factory)) engines.set(factory, 'Worker disabled by workerFactory'); return engines.get(factory)!; }
 const engine: Engine = {
  worker, jobs: new Map(), alive: false, preloadListeners: new Set(),
  startup: setTimeout(() => breakEngine(factory, engine, `The worker did not start within ${Math.round(startupMs / 1000)} seconds`, true), startupMs),
 };
 worker.onerror = event => { event.preventDefault(); breakEngine(factory, engine, event.message || 'The browser rejected worker startup', !engine.alive); };
 worker.onmessageerror = () => breakEngine(factory, engine, 'The worker response could not be read', false);
 worker.onmessage = (event: MessageEvent<Reply>) => {
  if (!engine.alive) { engine.alive = true; clearTimeout(engine.startup); }
  const reply = event.data;
  // Download progress concerns every waiting job: a scan may be queued behind a preload that is still downloading.
  if (reply.status === 'progress') { for (const job of engine.jobs.values()) job.onProgress(reply.message ?? ''); return; }
  const job = reply.id === undefined ? undefined : engine.jobs.get(reply.id);
  if (job) { engine.jobs.delete(reply.id!); job.onReply(reply); }
 };
 engines.set(factory, engine);
 return engine;
}
function send(engine: Engine, message: Record<string, unknown>, job: Job) {
 const id = nextJob++;
 engine.jobs.set(id, job);
 engine.worker.postMessage({ id, ...message });
 return id;
}

export type PreloadOptions = Pick<DescriptorOptions, 'assetBaseUrl' | 'workerFactory' | 'workerStartupTimeoutMs' | 'accelerator'> & {
 /** Loading progress for this caller (e.g. "Loading models on this device: 12.0 / 52.0 MB"). */
 onProgress?: (message: string) => void;
 /** Stop reporting progress to this caller; the preload itself continues for everyone else. */
 signal?: AbortSignal;
};
/**
 * Download and start the on-device models in the background, e.g. as soon as a sign-in form opens, so the first scan
 * starts at once. No photo is processed. One preload per page: repeated calls share it. Resolves with the runtime in
 * use, or null when skipped (the browser asks to save data), unavailable or failed. Never rejects.
 */
export function preloadObjectModels(options: PreloadOptions = {}): Promise<RuntimeChoice | null> {
 if ((globalThis.navigator as { connection?: { saveData?: boolean } } | undefined)?.connection?.saveData) return Promise.resolve(null);
 const factory = options.workerFactory ?? defaultWorker;
 const engine = engineFor(factory, options.workerStartupTimeoutMs ?? 12_000);
 if (typeof engine === 'string') return Promise.resolve(null);
 if (engine.ready) return Promise.resolve(engine.ready);
 const listener = options.onProgress;
 if (listener && !options.signal?.aborted) {
  engine.preloadListeners.add(listener);
  options.signal?.addEventListener('abort', () => engine.preloadListeners.delete(listener), { once: true });
 }
 engine.preload ??= new Promise<RuntimeChoice | null>(resolve => {
  send(engine, { mode: 'preload', assetBaseUrl: resolveAssetBase(options.assetBaseUrl ?? assetBaseUrl()), accelerator: options.accelerator ?? objectAccelerator() }, {
   onProgress: message => engine.preloadListeners.forEach(notify => notify(message)),
   onReply: reply => resolve(reply.status === 'complete' && reply.runtime ? reply.runtime : null),
   onBroken: () => resolve(null),
  });
 }).then(runtime => {
  engine.preloadListeners.clear();
  // A failed preload (e.g. a dropped connection) may be retried by the next call.
  if (runtime) engine.ready = runtime; else engine.preload = undefined;
  return runtime;
 });
 return engine.preload;
}

/**
 * Scanner v2: isolate the object (at the centre by default) in each photo and compute its descriptor, on this
 * device. Photos are processed in order by the page's long-lived worker, so the models load once per page (or are
 * already loaded by preloadObjectModels()). Rejects with a clear message when no object is found; photos never
 * leave the browser.
 */
export function extractObjectDescriptors(images: Blob[], options: DescriptorOptions = {}): Promise<ObjectScanResult[]> {
 const base = resolveAssetBase(options.assetBaseUrl ?? assetBaseUrl());
 const startup = options.workerStartupTimeoutMs ?? 12_000, stall = options.stallTimeoutMs ?? 300_000;
 const factory = options.workerFactory ?? defaultWorker;
 return new Promise<ObjectScanResult[]>((resolve, reject) => {
  const results: ObjectScanResult[] = [];
  let engine: Engine | undefined, jobId: number | undefined, done = false, inPage = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const settle = (error?: Error) => {
   if (done) return;
   done = true; clearTimeout(stallTimer); options.signal?.removeEventListener('abort', abort);
   // Stop this call's job in the worker (at its next step) without unloading the models.
   if (engine && jobId !== undefined && engine.jobs.delete(jobId)) engine.worker.postMessage({ mode: 'cancel', id: jobId });
   if (error) reject(error); else resolve(results);
  };
  const abort = () => settle(new DOMException('Image processing cancelled.', 'AbortError') as Error);
  const armStall = () => {
   clearTimeout(stallTimer);
   stallTimer = setTimeout(() => {
    const stuck = inPage ? undefined : engine;
    settle(new Error('No model download or processing progress for five minutes. Keep this page open and try again.'));
    if (stuck) breakEngine(factory, stuck, 'The worker stopped responding', false);
   }, stall);
  };
  const progress = (message: string) => { if (!done) { options.onProgress?.(message); armStall(); } };
  const accept = (result: ObjectScanResult) => { results.push(result); options.onResult?.(results.length - 1, result); };
  const runInPage = async (reason: string) => {
   if (done || inPage) return;
   inPage = true; engine = undefined; jobId = undefined; options.onFallback?.(reason);
   try {
    const { runObjectDescriptor } = await import('./dino-inference.ts');
    while (!done && results.length < images.length) accept(await runObjectDescriptor(images[results.length], progress, () => done, options.point, base, options.brush, options.accelerator ?? objectAccelerator()));
    settle();
   } catch (error) { settle(error instanceof Error ? error : new Error('On-device processing failed.')); }
  };
  const next = () => {
   if (done || !engine) return;
   if (results.length === images.length) { settle(); return; }
   const current = engine;
   jobId = send(current, { mode: 'descriptor', image: images[results.length], point: options.point, assetBaseUrl: base, brush: options.brush, accelerator: options.accelerator ?? objectAccelerator() }, {
    onProgress: progress,
    onReply: reply => {
     if (done) return;
     jobId = undefined;
     if (reply.status === 'complete' && validResult(reply.result)) { accept(reply.result); next(); }
     // A clear "no object" answer is the user's to fix (retake), not a reason to switch runtimes.
     else if (reply.status === 'error' && typeof reply.message === 'string' && reply.message.startsWith('No object found')) settle(new Error(reply.message));
     else { void runInPage(reply.message || 'Invalid worker output'); breakEngine(factory, current, 'The worker failed a job', false); }
    },
    onBroken: reason => { jobId = undefined; void runInPage(reason); },
   });
  };
  if (!images.length) { resolve([]); return; }
  if (options.signal?.aborted) { abort(); return; }
  options.signal?.addEventListener('abort', abort, { once: true });
  armStall();
  const found = engineFor(factory, startup);
  if (typeof found === 'string') { void runInPage(found); return; }
  engine = found;
  next();
 });
}
