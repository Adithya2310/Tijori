import { pipeline, env, RawImage, type ImageFeatureExtractionPipeline, type ImageClassificationPipeline } from '@huggingface/transformers';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION, featuresFromTokens } from './dino.ts';
import { CATEGORY_MODEL, CATEGORY_REVISION, OBJECT_PREPROCESS_VERSION, categoryFromPredictions, selectObjectCandidate, type ObjectScan } from './object-scan.ts';
import { OBJECT_DEVICE } from './object-runtime.ts';

// Shared by the worker and browser-page fallback. Never used by server routes.
env.allowLocalModels = false;
// The browser fetches the pinned files from this app, never from an inference service/CDN.
env.remoteHost = new URL('/dino-assets/models/', self.location.origin).href;
// Pipeline metadata discovery may omit revision; every request still uses this pin.
env.remotePathTemplate = '{model}/{revision}/';
const originalFetch=env.fetch!;
env.fetch=(input,init)=>originalFetch(typeof input==='string'?input.replace('/Xenova/dinov2-small/main/',`/Xenova/dinov2-small/${DINO_REVISION}/`).replace('/Xenova/mobilevit-xx-small/main/',`/Xenova/mobilevit-xx-small/${CATEGORY_REVISION}/`):input,init);
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
const runtimeBase = new URL(`/dino-assets/runtime/${DINO_RUNTIME_VERSION}/`, self.location.origin).href;
env.backends.onnx.wasm!.wasmPaths = { mjs: runtimeBase + 'ort-wasm-simd-threaded.mjs', wasm: runtimeBase + 'ort-wasm-simd-threaded.wasm' };
let extractor: Promise<ImageFeatureExtractionPipeline> | undefined;
let classifier: Promise<ImageClassificationPipeline> | undefined;
const listeners = new Set<(message: string) => void>();

export async function extractObjectFeatures(imageBlob: Blob, progress: (message: string) => void, cancelled: () => boolean = () => false, point?: import('./object-isolation').ObjectPoint, preprocessVersion:1|2=2, box?: import('./object-isolation').ObjectBox) {
 if (typeof WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.');
 listeners.add(progress);
 let url: string | undefined;
 try {
  progress('Loading DINOv2 on this device…');
  extractor ??= pipeline('image-feature-extraction', DINO_MODEL, {
   device: OBJECT_DEVICE, dtype: 'fp32', revision: DINO_REVISION,
   progress_callback: info => {
    if (info.status === 'progress' && info.file.endsWith('.onnx')) for (const notify of listeners) notify(`Downloading model from this app: ${(info.loaded / 1e6).toFixed(1)} / ${(info.total / 1e6).toFixed(1)} MB (${Math.round(info.progress)}%)`);
    if (info.status === 'done' && info.file.endsWith('.onnx')) for (const notify of listeners) notify('Model downloaded. Starting the on-device runtime…');
   },
  }).catch(error => { extractor = undefined; throw error; });
  const model = await extractor;
  if (cancelled()) throw Error('Image processing cancelled.');
  const processor = model.processor.image_processor;
  if (!processor) throw Error('Missing image processor.');
  // Versioned 224 × 224 bilinear resize and ImageNet normalization.
  processor.size = { height: 224, width: 224 };
  processor.do_center_crop = false; processor.do_resize = true; processor.resample = 2;
  processor.do_normalize = true;
  processor.image_mean = [0.485, 0.456, 0.406]; processor.image_std = [0.229, 0.224, 0.225];
  let scan:ObjectScan|undefined,preparedImage:RawImage|undefined;
  if(preprocessVersion===2&&!point&&!box)throw Error('Select one object in the photo before scanning.');
  const activePoint = point ?? (box ? { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 } : undefined);
  if(activePoint){
   const imageId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await imageBlob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   const {prepareObjectImage}=await import('./object-isolation.ts');
   const prepared=await prepareObjectImage(imageBlob,activePoint,progress,cancelled,preprocessVersion,box);preparedImage=prepared.image;
   if(preprocessVersion===2){
    progress('Checking the selected object category on this device…');
    classifier??=pipeline('image-classification',CATEGORY_MODEL,{revision:CATEGORY_REVISION,device:OBJECT_DEVICE,dtype:'fp32'}).catch(e=>{classifier=undefined;throw e;});
    const classify=await classifier;
    const options:{image:RawImage;scan:ObjectScan}[]=[];
    // SAM proposes nested masks (e.g. label vs whole bottle). Choose among
    // point-containing candidates only, using the SAME strict quality/category
    // gates. Never substitute the full scene or lower a gate to force a pass.
    for(const candidate of [prepared,...prepared.alternatives]) {
     if(cancelled())throw Error('Image processing cancelled.');
     const predictions=await classify(candidate.image.clone(),{top_k:1000});
     options.push({image:candidate.image,scan:{preprocess:OBJECT_PREPROCESS_VERSION,imageId,category:categoryFromPredictions(predictions as {label:string;score:number}[]),quality:candidate.quality,foreground:candidate.foreground}});
    }
    const selected=selectObjectCandidate(options.map(option=>option.scan));
    scan=selected.scan;preparedImage=options[selected.index].image;
   }
  }
  progress('Extracting object features on this device…');
  url = URL.createObjectURL(imageBlob);
  const image = preparedImage ?? await RawImage.fromURL(url);
  if (cancelled()) throw Error('Image processing cancelled.');
  const output = await model(image, { pool: false });
  if (cancelled()) throw Error('Image processing cancelled.');
  const features=featuresFromTokens(output.data as Float32Array, output.dims);
  return {...features,...(scan?{scan}:{})};
 } finally {
  listeners.delete(progress);
  if (url) URL.revokeObjectURL(url);
 }
}
