// Pure geometry for scanner v2 (no model imports): object region selection, square padding, patch coverage and
// foreground pooling of DINOv2 tokens.
/** A point inside the object, in 0–1 photo coordinates. Defaults to the centre of the photo. */
export type ObjectPoint = { x: number; y: number };
export const CENTRE: ObjectPoint = { x: 0.5, y: 0.5 };
/** Patch grid of DINOv2-small at 224 × 224 (14-pixel patches). */
export const PATCH_GRID = 16;
export const OBJECT_NOT_FOUND = 'No object found at the centre. Hold your object in the middle of the frame, in good light, and try again.';

// Quality gate: an object must be found, and the "object" must not be the whole frame or background.
export const MIN_OBJECT_FRACTION = 0.005, MAX_OBJECT_FRACTION = 0.9;
/**
 * Pick the SAM mask for the whole object at the prompt point. SAM returns nested masks (part, sub-object, object);
 * the best-scoring one is often just the part under the point (a bottle's label). Among confident masks that
 * contain the point and are not the whole frame, take the largest.
 */
export function chooseMask(masks: Uint8Array, scores: number[], size: number, seedIndex: number): number {
 const candidates = scores.map((score, index) => {
  let area = 0; for (let i = index * size, end = i + size; i < end; i++) area += masks[i] ? 1 : 0;
  return { score, index, fraction: area / size, hasSeed: !!masks[index * size + seedIndex] };
 });
 const usable = candidates.filter(c => c.hasSeed && c.fraction >= MIN_OBJECT_FRACTION && c.fraction <= MAX_OBJECT_FRACTION);
 if (!usable.length) return [...candidates].sort((a, b) => b.score - a.score)[0].index;
 const top = Math.max(...usable.map(c => c.score));
 return usable.filter(c => c.score >= 0.75 * top).sort((a, b) => b.fraction - a.fraction)[0].index;
}

/** Keep only the 4-connected region of `mask` that contains `seed` (or the largest region if the seed is outside). */
export function regionAt(mask: Uint8Array, width: number, height: number, seed: { x: number; y: number }): Uint8Array {
 const label = new Int32Array(width * height), stack: number[] = [];
 let next = 0, bestLabel = 0, bestSize = 0;
 const seedIndex = Math.min(height - 1, Math.max(0, Math.round(seed.y))) * width + Math.min(width - 1, Math.max(0, Math.round(seed.x)));
 for (let start = 0; start < mask.length; start++) {
  if (!mask[start] || label[start]) continue;
  next++; let size = 0; stack.push(start); label[start] = next;
  while (stack.length) {
   const i = stack.pop()!, x = i % width, y = (i - x) / width; size++;
   for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
    if (j >= 0 && mask[j] && !label[j]) { label[j] = next; stack.push(j); }
   }
  }
  if (size > bestSize) { bestSize = size; bestLabel = next; }
 }
 const keep = label[seedIndex] || bestLabel;
 return Uint8Array.from(label, l => (l === keep && keep ? 1 : 0));
}

/** Pad the object's bounding box to a square (object centred) and measure patch coverage on the 16 × 16 grid. */
export function squareCrop(region: Uint8Array, width: number, height: number) {
 let left = width, top = height, right = -1, bottom = -1, area = 0;
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (region[y * width + x]) { area++; if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
 if (right < left) return null;
 const boxW = right - left + 1, boxH = bottom - top + 1, side = Math.ceil(Math.max(boxW, boxH) * 1.08);
 const originX = left - Math.floor((side - boxW) / 2), originY = top - Math.floor((side - boxH) / 2);
 const grid = new Float32Array(PATCH_GRID * PATCH_GRID), cell = side / PATCH_GRID;
 for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
  if (!region[y * width + x]) continue;
  const gx = Math.min(PATCH_GRID - 1, Math.floor((x - originX) / cell)), gy = Math.min(PATCH_GRID - 1, Math.floor((y - originY) / cell));
  grid[gy * PATCH_GRID + gx]++;
 }
 for (let i = 0; i < grid.length; i++) grid[i] /= cell * cell;
 return { originX, originY, side, grid, objectFraction: area / (width * height) };
}

/** A scanner v2 descriptor: CLS token plus the mean of the object's patch tokens, and the scan's quality. */
/** `preview` is the isolated object crop (local only, never uploaded) so the UI can show what was scanned. */
export type ObjectScanResult = { descriptor: { cls: number[]; fg: number[] }; objectFraction: number; foregroundPatches: number; preview?: Blob };
/** Patches at least this covered by the object count as foreground. */
export const FOREGROUND_COVERAGE = 0.35;
/** Pool DINOv2 tokens ([1, 257, 384]) into CLS and an object-only (foreground) mean, using the patch coverage grid. */
export function poolForeground(tokens: ArrayLike<number>, dims: readonly number[], grid: ArrayLike<number>) {
 const dimension = 384, patches = PATCH_GRID * PATCH_GRID;
 if (dims.join(',') !== `1,${patches + 1},${dimension}` || tokens.length !== (patches + 1) * dimension || grid.length !== patches) throw Error('Unexpected DINOv2 output. Expected 224 × 224 input and 384-dimensional tokens.');
 const cls = Array.from({ length: dimension }, (_, i) => tokens[i]);
 let weights = Array.from(grid, coverage => (coverage >= FOREGROUND_COVERAGE ? coverage : 0));
 // Very thin objects (a pen seen end-on) may not fill any patch: fall back to every touched patch.
 if (weights.filter(Boolean).length < 2) weights = Array.from(grid, coverage => (coverage > 0 ? coverage : 0));
 const used = weights.filter(Boolean).length;
 if (!used) throw Error(OBJECT_NOT_FOUND);
 const fg = Array(dimension).fill(0) as number[];
 weights.forEach((weight, patch) => { if (weight) for (let i = 0; i < dimension; i++) fg[i] += weight * tokens[(patch + 1) * dimension + i]; });
 return { cls, fg, foregroundPatches: used };
}
