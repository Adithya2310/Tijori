import { pipeline, env, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION, featuresFromTokens, type DinoFeatures } from '@tijori/core/dino';
import { assetBaseUrl, modelsUrl, runtimeUrl } from './assets.ts';
import { CENTRE, poolForeground, type ObjectBrush, type ObjectPoint, type ObjectScanResult } from './object-geometry.ts';
export { poolForeground, FOREGROUND_COVERAGE, type ObjectScanResult } from './object-geometry.ts';

// On-device DINOv2 inference, shared by the worker and the in-page fallback. Never used on a server.
let configuredFor: string | undefined;
/**
 * Point transformers.js at the self-hosted assets. Called automatically before inference; the first base used wins
 * for the lifetime of the page or worker, because loaded models are cached.
 */
export function configureDinoRuntime(base: string = assetBaseUrl()) {
 if (configuredFor) return;
 configuredFor = base;
 env.allowLocalModels = false;
 // The browser fetches the pinned files from the asset host, never from an inference service.
 env.remoteHost = modelsUrl(base);
 // Pipeline metadata discovery may omit revision; every request still uses this pin.
 env.remotePathTemplate = '{model}/{revision}/';
 const originalFetch = env.fetch!;
 env.fetch = (input, init) => originalFetch(typeof input === 'string' ? input.replace(`/${DINO_MODEL}/main/`, `/${DINO_MODEL}/${DINO_REVISION}/`) : input, init);
 const wasm = env.backends.onnx.wasm!;
 wasm.numThreads = 1;
 wasm.proxy = false;
 // The WASM folder follows the ONNX Runtime build that is actually loaded (pinned through @huggingface/transformers).
 const loaded = (env.backends.onnx as { versions?: { web?: string } }).versions?.web ?? DINO_RUNTIME_VERSION;
 const runtime = runtimeUrl(base, loaded);
 wasm.wasmPaths = { mjs: runtime + 'ort-wasm-simd-threaded.mjs', wasm: runtime + 'ort-wasm-simd-threaded.wasm' };
}

let extractor: Promise<ImageFeatureExtractionPipeline> | undefined;
const listeners = new Set<(message: string) => void>();

/** Extract DINOv2 features in the current thread. Prefer extractObjectFeatures(), which uses a worker first. */
async function loadExtractor(progress: (message: string) => void, cancelled: () => boolean) {
 progress('Loading DINOv2 on this device…');
 extractor ??= pipeline('image-feature-extraction', DINO_MODEL, {
  device: 'wasm', dtype: 'fp32', revision: DINO_REVISION,
  progress_callback: info => {
   if (info.status === 'progress' && info.file.endsWith('.onnx')) for (const notify of listeners) notify(`Downloading model: ${(info.loaded / 1e6).toFixed(1)} / ${(info.total / 1e6).toFixed(1)} MB (${Math.round(info.progress)}%)`);
   if (info.status === 'done' && info.file.endsWith('.onnx')) for (const notify of listeners) notify('Model downloaded. Starting the on-device runtime…');
  },
 }).catch(error => { extractor = undefined; throw error; });
 const model = await extractor;
 if (cancelled()) throw Error('Image processing cancelled.');
 const processor = model.processor.image_processor;
 if (!processor) throw Error('Missing image processor.');
 // 224 × 224 bilinear resize (the input is already square, so nothing is stretched) and ImageNet normalization.
 processor.size = { height: 224, width: 224 };
 processor.do_center_crop = false; processor.do_resize = true; processor.resample = 2;
 processor.do_normalize = true;
 processor.image_mean = [0.485, 0.456, 0.406]; processor.image_std = [0.229, 0.224, 0.225];
 return model;
}
async function embed(model: ImageFeatureExtractionPipeline, blob: Blob, cancelled: () => boolean) {
 const url = URL.createObjectURL(blob);
 try {
  const image = await RawImage.fromURL(url);
  if (cancelled()) throw Error('Image processing cancelled.');
  const output = await model(image, { pool: false });
  if (cancelled()) throw Error('Image processing cancelled.');
  return { data: output.data as Float32Array, dims: output.dims as number[] };
 } finally { URL.revokeObjectURL(url); }
}

/** Extract DINOv2 features in the current thread (scanner v1). Prefer extractObjectFeatures(), which uses a worker. */
export async function runDinoInference(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point?: ObjectPoint, base?: string): Promise<DinoFeatures> {
 if (typeof WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.');
 configureDinoRuntime(base);
 listeners.add(progress);
 try {
  const model = await loadExtractor(progress, cancelled);
  if (point) { const { isolateObject } = await import('./object-isolation.ts'); imageBlob = await isolateObject(imageBlob, point, progress, cancelled); }
  progress('Extracting object features on this device…');
  const { data, dims } = await embed(model, imageBlob, cancelled);
  return featuresFromTokens(data, dims);
 } finally { listeners.delete(progress); }
}

/** Isolate the object at `point` (default: the centre) and compute its scanner v2 descriptor, in this thread. */
export async function runObjectDescriptor(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point: ObjectPoint = CENTRE, base?: string, brush?: ObjectBrush): Promise<ObjectScanResult> {
 if (typeof WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.');
 configureDinoRuntime(base);
 listeners.add(progress);
 try {
  const model = await loadExtractor(progress, cancelled);
  const { isolateObjectRegion } = await import('./object-isolation.ts');
  const isolated = await isolateObjectRegion(imageBlob, point, progress, cancelled, brush);
  progress('Reading your object on this device…');
  const { data, dims } = await embed(model, isolated.blob, cancelled);
  const { cls, fg, foregroundPatches } = poolForeground(data, dims, isolated.grid);
  return { descriptor: { cls, fg }, objectFraction: isolated.objectFraction, foregroundPatches, preview: isolated.blob, grid: Array.from(isolated.grid, v => Math.round(v * 100) / 100) };
 } finally { listeners.delete(progress); }
}
