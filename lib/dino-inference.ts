import { pipeline, env, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION, featuresFromTokens } from './dino';

// Shared by the worker and browser-page fallback. Never used by server routes.
env.allowLocalModels = false;
// The browser fetches the pinned files from this app, never from an inference service/CDN.
env.remoteHost = new URL('/dino-assets/models/', self.location.origin).href;
// Pipeline metadata discovery may omit revision; every request still uses this pin.
env.remotePathTemplate = '{model}/{revision}/';
const originalFetch=env.fetch!;
env.fetch=(input,init)=>originalFetch(typeof input==='string'?input.replace('/Xenova/dinov2-small/main/',`/Xenova/dinov2-small/${DINO_REVISION}/`):input,init);
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
const runtimeBase = new URL(`/dino-assets/runtime/${DINO_RUNTIME_VERSION}/`, self.location.origin).href;
env.backends.onnx.wasm!.wasmPaths = { mjs: runtimeBase + 'ort-wasm-simd-threaded.mjs', wasm: runtimeBase + 'ort-wasm-simd-threaded.wasm' };
let extractor: Promise<ImageFeatureExtractionPipeline> | undefined;
const listeners = new Set<(message: string) => void>();

export async function extractObjectFeatures(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point?: import('./object-isolation').ObjectPoint) {
 if (typeof WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.');
 listeners.add(progress);
 let url: string | undefined;
 try {
  progress('Loading DINOv2 on this device…');
  extractor ??= pipeline('image-feature-extraction', DINO_MODEL, {
   device: 'wasm', dtype: 'fp32', revision: DINO_REVISION,
   progress_callback: info => {
    if (info.status === 'progress' && info.file.endsWith('.onnx')) for (const notify of listeners) notify(`Downloading model from this app: ${(info.loaded / 1e6).toFixed(1)} / ${(info.total / 1e6).toFixed(1)} MB (${Math.round(info.progress)}%)`);
    if (info.status === 'done' && info.file.endsWith('.onnx')) for (const notify of listeners) notify('Model downloaded. Starting the on-device runtime…');
   },
  }).catch(error => { extractor = undefined; throw error; });
  const model = await extractor;
  if (cancelled()) throw Error('Image processing cancelled.');
  const processor = model.processor.image_processor;
  if (!processor) throw Error('Missing image processor.');
  // VILA's 224 × 224 bilinear resize and ImageNet normalization.
  processor.size = { height: 224, width: 224 };
  processor.do_center_crop = false; processor.do_resize = true; processor.resample = 2;
  processor.do_normalize = true;
  processor.image_mean = [0.485, 0.456, 0.406]; processor.image_std = [0.229, 0.224, 0.225];
  if(point){const {isolateObject}=await import('./object-isolation');imageBlob=await isolateObject(imageBlob,point,progress,cancelled);}
  progress('Extracting object features on this device…');
  url = URL.createObjectURL(imageBlob);
  const image = await RawImage.fromURL(url);
  if (cancelled()) throw Error('Image processing cancelled.');
  const output = await model(image, { pool: false });
  if (cancelled()) throw Error('Image processing cancelled.');
  return featuresFromTokens(output.data as Float32Array, output.dims);
 } finally {
  listeners.delete(progress);
  if (url) URL.revokeObjectURL(url);
 }
}
