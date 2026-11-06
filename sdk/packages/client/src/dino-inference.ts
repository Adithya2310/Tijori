import { pipeline, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { DINO_MODEL, DINO_REVISION, featuresFromTokens, type DinoFeatures } from '@tijori/core/dino';
import { loadListeners, prepareRuntime, reportDownload, type ObjectAccelerator, type RuntimeChoice } from './on-device-runtime.ts';
import { CENTRE, poolForeground, type ObjectBrush, type ObjectPoint, type ObjectScanResult } from './object-geometry.ts';
export { poolForeground, FOREGROUND_COVERAGE, type ObjectScanResult } from './object-geometry.ts';
export { configureDinoRuntime, type ObjectAccelerator, type RuntimeChoice } from './on-device-runtime.ts';

// On-device DINOv2 inference, shared by the worker and the in-page fallback. Never used on a server.
// DINOv2 runs 8-bit on the CPU everywhere (about 24 MB instead of 88 MB at full precision, with descriptors within
// 0.01 of it), so every device computes the same descriptor for the same photo.
let extractor: Promise<ImageFeatureExtractionPipeline> | undefined;

async function loadExtractor(progress: (message: string) => void, cancelled: () => boolean) {
 progress('Loading DINOv2 on this device…');
 extractor ??= (pipeline('image-feature-extraction', DINO_MODEL, { device: 'wasm', dtype: 'q8', revision: DINO_REVISION, progress_callback: reportDownload }) as Promise<ImageFeatureExtractionPipeline>)
  .catch(error => { extractor = undefined; throw error; });
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
const requireWasm = () => { if (typeof WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.'); };

/**
 * Download and start DINOv2 and SlimSAM (in parallel) without processing a photo, so the next scan starts at once.
 * On WebGPU the image encoder also runs once on a blank image to compile its shaders. Returns the runtime used.
 */
export async function loadObjectModels(progress: (message: string) => void = () => {}, base?: string, accelerator?: ObjectAccelerator): Promise<RuntimeChoice> {
 requireWasm();
 const runtime = await prepareRuntime(base, accelerator);
 loadListeners.add(progress);
 try {
  const { loadIsolationModels, warmUpIsolation } = await import('./object-isolation.ts');
  await Promise.all([loadExtractor(progress, () => false), loadIsolationModels(runtime.device)]);
  return { ...runtime, device: await warmUpIsolation() };
 } finally { loadListeners.delete(progress); }
}

/** Extract DINOv2 features in the current thread (scanner v1). Prefer extractObjectFeatures(), which uses a worker. */
export async function runDinoInference(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point?: ObjectPoint, base?: string): Promise<DinoFeatures> {
 requireWasm();
 await prepareRuntime(base, 'wasm');
 loadListeners.add(progress);
 try {
  const model = await loadExtractor(progress, cancelled);
  if (point) { const { isolateObject } = await import('./object-isolation.ts'); imageBlob = await isolateObject(imageBlob, point, progress, cancelled); }
  progress('Extracting object features on this device…');
  const { data, dims } = await embed(model, imageBlob, cancelled);
  return featuresFromTokens(data, dims);
 } finally { loadListeners.delete(progress); }
}

/** Isolate the object at `point` (default: the centre) and compute its scanner v2 descriptor, in this thread. */
export async function runObjectDescriptor(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point: ObjectPoint = CENTRE, base?: string, brush?: ObjectBrush, accelerator?: ObjectAccelerator): Promise<ObjectScanResult> {
 requireWasm();
 const runtime = await prepareRuntime(base, accelerator);
 loadListeners.add(progress);
 try {
  const { isolateObjectRegion, loadIsolationModels } = await import('./object-isolation.ts');
  const [model] = await Promise.all([loadExtractor(progress, cancelled), loadIsolationModels(runtime.device)]);
  const isolated = await isolateObjectRegion(imageBlob, point, progress, cancelled, brush);
  progress('Reading your object on this device…');
  const { data, dims } = await embed(model, isolated.blob, cancelled);
  const { cls, fg, foregroundPatches } = poolForeground(data, dims, isolated.grid);
  return { descriptor: { cls, fg }, objectFraction: isolated.objectFraction, foregroundPatches, preview: isolated.blob, grid: Array.from(isolated.grid, v => Math.round(v * 100) / 100) };
 } finally { loadListeners.delete(progress); }
}
