import { SamModel, AutoProcessor, RawImage, type SamProcessor } from '@huggingface/transformers';
export const SAM_MODEL = 'Xenova/slimsam-77-uniform';
export const SAM_REVISION = '5850ab45f587c112167512ffef949107115e26a0';
import { CENTRE, OBJECT_NOT_FOUND, MAX_OBJECT_FRACTION, MIN_OBJECT_FRACTION, chooseMask, guideDisc, regionAt, squareCrop, type ObjectPoint } from './object-geometry.ts';
export { CENTRE, PATCH_GRID, OBJECT_NOT_FOUND, type ObjectPoint } from './object-geometry.ts';
export type IsolatedObject = {
 /** Square PNG: the object on white, centred and padded (never stretched). */
 blob: Blob;
 /** Fraction of each of the 16 × 16 patch cells covered by the object (row-major). */
 grid: Float32Array;
 /** Share of the photo the object covers. */
 objectFraction: number;
};

let model: ReturnType<typeof SamModel.from_pretrained> | undefined;
let processor: ReturnType<typeof AutoProcessor.from_pretrained> | undefined;
type Canvas = OffscreenCanvas | HTMLCanvasElement;
const canvasOf = (width: number, height: number): Canvas => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
const toPng = (canvas: Canvas): Promise<Blob> => typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
 ? canvas.convertToBlob({ type: 'image/png' })
 : new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob(value => value ? resolve(value) : reject(Error('Could not isolate the object.')), 'image/png'));

/**
 * Isolate the object at `point` (default: the centre) with SlimSAM, on this device. Returns a square crop of the
 * object on white plus its patch coverage grid, or throws OBJECT_NOT_FOUND when no plausible object is there.
 */
export async function isolateObjectRegion(blob: Blob, point: ObjectPoint = CENTRE, progress: (message: string) => void = () => {}, cancelled: () => boolean = () => false): Promise<IsolatedObject> {
 if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw Error('Tap inside the object photo.');
 progress('Loading object isolation on this device…');
 model ??= SamModel.from_pretrained(SAM_MODEL, { revision: SAM_REVISION, device: 'wasm', dtype: 'q8' }).catch(e => { model = undefined; throw e; });
 processor ??= AutoProcessor.from_pretrained(SAM_MODEL, { revision: SAM_REVISION }).catch(e => { processor = undefined; throw e; });
 const [sam, preprocess] = await Promise.all([model, processor]);
 if (cancelled()) throw Error('Cancelled.');
 const url = URL.createObjectURL(blob);
 try {
  let image = await RawImage.fromURL(url);
  const scale = Math.min(1, 768 / Math.max(image.width, image.height));
  if (scale < 1) image = await image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
  image = image.rgba();
  // Snapshot the pixels first: SAM's preprocessing converts the same image to RGB in place.
  const { width, height } = image, pixels = new Uint8ClampedArray(image.data);
  const seed = { x: point.x * width, y: point.y * height };
  const inputs = await preprocess(image, { input_points: [[[seed.x, seed.y]]] });
  progress('Finding your object on this device…');
  const output = await sam(inputs);
  const masks = await (preprocess as SamProcessor).post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const scores = Array.from(output.iou_scores.data as Float32Array), all = masks[0].data as Uint8Array, size = width * height;
  // Only what lies inside the guide circle counts: hands, arms and background outside it are ignored.
  const disc = guideDisc(width, height);
  const chosen = chooseMask(all, scores, size, Math.min(height - 1, Math.round(seed.y)) * width + Math.min(width - 1, Math.round(seed.x)), disc);
  const inCircle = all.slice(chosen * size, (chosen + 1) * size).map((value, i) => (value && disc[i] ? 1 : 0));
  const region = regionAt(inCircle, width, height, seed);
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
