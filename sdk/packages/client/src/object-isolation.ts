import { SamModel, AutoProcessor, RawImage, type SamProcessor } from '@huggingface/transformers';
import { loadListeners, quietly, reportDownload, SAM_MODEL, SAM_REVISION, type RuntimeChoice } from './on-device-runtime.ts';
import { CENTRE, OBJECT_NOT_FOUND, MAX_OBJECT_FRACTION, MIN_OBJECT_FRACTION, brushPrompts, chooseBrushedMask, chooseMask, guideDisc, rasterizeBrush, regionAt, regionTouching, squareCrop, validBrush, type ObjectBrush, type ObjectPoint } from './object-geometry.ts';
export { CENTRE, PATCH_GRID, OBJECT_NOT_FOUND, type ObjectPoint } from './object-geometry.ts';
export { SAM_MODEL, SAM_REVISION } from './on-device-runtime.ts';
export type IsolatedObject = {
 /** Square PNG: the object on white, centred and padded (never stretched). */
 blob: Blob;
 /** Fraction of each of the 16 × 16 patch cells covered by the object (row-major). */
 grid: Float32Array;
 /** Share of the photo the object covers. */
 objectFraction: number;
};

type Isolation = { sam: Awaited<ReturnType<typeof SamModel.from_pretrained>>; processor: SamProcessor; device: RuntimeChoice['device'] };
let isolation: Promise<Isolation> | undefined;
let processor: Promise<SamProcessor> | undefined;
async function loadIsolation(device: RuntimeChoice['device']): Promise<Isolation> {
 processor ??= (AutoProcessor.from_pretrained(SAM_MODEL, { revision: SAM_REVISION }) as Promise<SamProcessor>).catch(e => { processor = undefined; throw e; });
 // On a GPU only the heavy image encoder runs there (16-bit); the small prompt decoder stays on the CPU.
 const sam = await SamModel.from_pretrained(SAM_MODEL, device === 'webgpu'
  ? { revision: SAM_REVISION, device: { vision_encoder: 'webgpu', prompt_encoder_mask_decoder: 'wasm' }, dtype: { vision_encoder: 'fp16', prompt_encoder_mask_decoder: 'q8' }, progress_callback: reportDownload }
  : { revision: SAM_REVISION, device: 'wasm', dtype: 'q8', progress_callback: reportDownload });
 return { sam, processor: await processor, device };
}
/** Load SlimSAM once per page or worker. A GPU that fails to start falls back to the CPU. */
export function loadIsolationModels(device: RuntimeChoice['device'] = 'wasm'): Promise<Isolation> {
 isolation ??= loadIsolation(device)
  .catch(error => { if (device !== 'webgpu') throw error; return loadIsolation('wasm'); })
  .catch(error => { isolation = undefined; throw error; });
 return isolation;
}
/** Switch SlimSAM to the CPU for the rest of this page or worker (e.g. after invalid GPU output). */
function switchIsolationToCpu() {
 const previous = isolation;
 isolation = loadIsolation('wasm').catch(error => { isolation = undefined; throw error; });
 void previous?.then(({ sam }) => sam.dispose?.()).catch(() => {});
 return isolation;
}
const validScores = (scores: number[]) => scores.length > 0 && scores.every(Number.isFinite);
/** Run SlimSAM once on a blank image so the GPU compiles its shaders before the first real photo. */
export async function warmUpIsolation() {
 const { sam, processor: preprocess, device } = await loadIsolationModels();
 if (device !== 'webgpu') return device;
 try {
  const blank = new RawImage(new Uint8ClampedArray(64 * 64 * 3).fill(255), 64, 64, 3);
  const output = await quietly(async () => sam(await preprocess(blank, { input_points: [[[32, 32]]] })));
  if (validScores(Array.from(output.iou_scores.data as Float32Array))) return device;
 } catch { /* the GPU cannot run it: use the CPU */ }
 return (await switchIsolationToCpu()).device;
}
type Canvas = OffscreenCanvas | HTMLCanvasElement;
const canvasOf = (width: number, height: number): Canvas => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
const toPng = (canvas: Canvas): Promise<Blob> => typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
 ? canvas.convertToBlob({ type: 'image/png' })
 : new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob(value => value ? resolve(value) : reject(Error('Could not isolate the object.')), 'image/png'));

/**
 * Isolate the object at `point` (default: the centre) with SlimSAM, on this device. Returns a square crop of the
 * object on white plus its patch coverage grid, or throws OBJECT_NOT_FOUND when no plausible object is there.
 */
export async function isolateObjectRegion(blob: Blob, point: ObjectPoint = CENTRE, progress: (message: string) => void = () => {}, cancelled: () => boolean = () => false, brush?: ObjectBrush): Promise<IsolatedObject> {
 if (brush !== undefined && !validBrush(brush)) throw Error('Brush over your object again.');
 if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw Error('Tap inside the object photo.');
 progress('Loading object isolation on this device…');
 loadListeners.add(progress);
 try { await loadIsolationModels(); } finally { loadListeners.delete(progress); }
 if (cancelled()) throw Error('Cancelled.');
 const url = URL.createObjectURL(blob);
 try {
  let image = await RawImage.fromURL(url);
  const scale = Math.min(1, 768 / Math.max(image.width, image.height));
  if (scale < 1) image = await image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
  image = image.rgba();
  // Snapshot the pixels first: SAM's preprocessing converts the same image to RGB in place.
  const { width, height } = image, pixels = new Uint8ClampedArray(image.data);
  const size = width * height;
  const segment = async (points: [number, number][], labels?: number[], retry = true): Promise<{ all: Uint8Array; scores: number[] }> => {
   const { sam, processor: preprocess, device } = await loadIsolationModels();
   const inputs = await preprocess(image, labels ? { input_points: [[points]], input_labels: [[labels]] } : { input_points: [[points]] });
   progress('Finding your object on this device…');
   // Some GPUs fail or return invalid numbers: redo this photo (and the rest of the session) on the CPU.
   const onCpu = async () => { await switchIsolationToCpu(); return segment(points, labels, false); };
   let output: Awaited<ReturnType<typeof sam>>;
   try { output = await sam(inputs); } catch (error) { if (device === 'webgpu' && retry) return onCpu(); throw error; }
   const scores = Array.from(output.iou_scores.data as Float32Array);
   if (!validScores(scores) && device === 'webgpu' && retry) return onCpu();
   const masks = await preprocess.post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
   return { all: masks[0].data as Uint8Array, scores };
  };
  let region: Uint8Array;
  if (brush) {
   // The user painted over the object: points on it, "not this" points around it, and the mask that best
   // matches the painting. If SAM disagrees with the painting, the painting itself is the object.
   const painted = rasterizeBrush(brush, width, height), prompt = brushPrompts(painted, width, height);
   const { all } = await segment(prompt.points, prompt.labels);
   const chosen = chooseBrushedMask(all, size, painted);
   const inBox = (i: number) => { const x = i % width, y = (i - x) / width; return x >= prompt.box.left && x <= prompt.box.right && y >= prompt.box.top && y <= prompt.box.bottom; };
   region = chosen < 0 ? painted : regionTouching(all.slice(chosen * size, (chosen + 1) * size).map((value, i) => (value && inBox(i) ? 1 : 0)), painted, width, height);
  } else {
   const seed = { x: point.x * width, y: point.y * height };
   const { all, scores } = await segment([[seed.x, seed.y]]);
   // Only what lies inside the guide circle counts: hands, arms and background outside it are ignored.
   const disc = guideDisc(width, height);
   const chosen = chooseMask(all, scores, size, Math.min(height - 1, Math.round(seed.y)) * width + Math.min(width - 1, Math.round(seed.x)), disc);
   region = regionAt(all.slice(chosen * size, (chosen + 1) * size).map((value, i) => (value && disc[i] ? 1 : 0)), width, height, seed);
  }
  const crop = squareCrop(region, width, height);
  if (!crop || crop.objectFraction < MIN_OBJECT_FRACTION || crop.objectFraction > MAX_OBJECT_FRACTION) throw Error(OBJECT_NOT_FOUND);
  if (cancelled()) throw Error('Cancelled.');
  const out = canvasOf(crop.side, crop.side);
  const context = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw Error('Image processing is unavailable.');
  const square = new Uint8ClampedArray(crop.side * crop.side * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
   const i = y * width + x, sx = x - crop.originX, sy = y - crop.originY;
   if (!region[i] || sx < 0 || sy < 0 || sx >= crop.side || sy >= crop.side) continue;
   const from = i * 4, to = (sy * crop.side + sx) * 4;
   square[to] = pixels[from]; square[to + 1] = pixels[from + 1]; square[to + 2] = pixels[from + 2];
  }
  context.putImageData(new ImageData(square, crop.side, crop.side), 0, 0);
  return { blob: await toPng(out), grid: crop.grid, objectFraction: crop.objectFraction };
 } finally { URL.revokeObjectURL(url); }
}

/** @deprecated Scanner v1 entry point, kept for 0.1.x callers. Returns the isolated square crop. */
export async function isolateObject(blob: Blob, point: ObjectPoint, progress: (message: string) => void, cancelled: () => boolean): Promise<Blob> {
 return (await isolateObjectRegion(blob, point, progress, cancelled)).blob;
}
