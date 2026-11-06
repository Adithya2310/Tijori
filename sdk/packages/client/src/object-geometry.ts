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
/** Diameter of the on-screen guide circle as a fraction of the photo's shorter side. The object belongs inside it. */
export const GUIDE_FRACTION = 0.7;
/** Pixels of a `width` × `height` photo inside the centred guide circle. */
export function guideDisc(width: number, height: number): Uint8Array {
 const disc = new Uint8Array(width * height), radius = (GUIDE_FRACTION / 2) * Math.min(width, height), cx = (width - 1) / 2, cy = (height - 1) / 2;
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) disc[y * width + x] = (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius ? 1 : 0;
 return disc;
}
/**
 * Pick the SAM mask for the object in the guide circle. SAM's candidates are nested: part (a bottle's label), the
 * object, and something bigger (object + hand + head, or the table). Among confident candidates that contain the
 * prompt point, take the largest one lying entirely inside the circle: bigger regions spill over its edge (the person
 * holding the object), smaller ones are parts. When nothing fits inside (the object fills the circle), fall back to the
 * best in-circle fit, area inside × (share inside)²; the caller then trims the region to the circle.
 */
export function chooseMask(masks: Uint8Array, scores: number[], size: number, seedIndex: number, disc?: Uint8Array): number {
 const candidates = scores.map((score, index) => {
  let area = 0, inside = 0;
  for (let i = 0; i < size; i++) if (masks[index * size + i]) { area++; if (!disc || disc[i]) inside++; }
  const share = area ? inside / area : 0;
  return { score, index, fraction: area / size, share, hasSeed: !!masks[index * size + seedIndex], fit: inside * share * share };
 });
 const usable = candidates.filter(c => c.hasSeed && c.fraction >= MIN_OBJECT_FRACTION && c.fraction <= MAX_OBJECT_FRACTION);
 if (!usable.length) return [...candidates].sort((a, b) => b.score - a.score)[0].index;
 const top = Math.max(...usable.map(c => c.score));
 const confident = usable.filter(c => c.score >= 0.6 * top);
 const contained = confident.filter(c => c.share >= 0.95);
 if (contained.length) return contained.sort((a, b) => b.fraction - a.fraction)[0].index;
 return confident.sort((a, b) => b.fit - a.fit)[0].index;
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
export type ObjectScanResult = { descriptor: { cls: number[]; fg: number[] }; objectFraction: number; foregroundPatches: number; preview?: Blob; /** 16 × 16 patch coverage of the isolated object (a coarse silhouette, no pixels). */ grid?: number[] };
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

// ---------- Brush: the user paints over the object to say exactly what to register ----------
/** One stroke, as points in 0–1 photo coordinates. */
export type BrushStroke = { x: number; y: number }[];
/** Strokes plus the brush radius as a fraction of the photo's shorter side. */
export type ObjectBrush = { strokes: BrushStroke[]; radius: number };
export const validBrush = (brush: unknown): brush is ObjectBrush => {
 const b = brush as ObjectBrush;
 return !!b && Array.isArray(b.strokes) && b.strokes.length > 0 && b.strokes.length <= 50 && typeof b.radius === 'number' && b.radius > 0 && b.radius < 0.5
  && b.strokes.every(s => Array.isArray(s) && s.length > 0 && s.length <= 2000 && s.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
};
/** Paint the strokes into a `width` × `height` mask (discs along each segment). */
export function rasterizeBrush(brush: ObjectBrush, width: number, height: number): Uint8Array {
 const mask = new Uint8Array(width * height), r = Math.max(1, brush.radius * Math.min(width, height));
 const disc = (cx: number, cy: number) => {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++)
   for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * width + x] = 1;
 };
 for (const stroke of brush.strokes) {
  const points = stroke.map(p => ({ x: p.x * (width - 1), y: p.y * (height - 1) }));
  points.forEach((p, i) => {
   const q = points[i + 1] ?? p, steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (r / 2)));
   for (let s = 0; s <= steps; s++) disc(p.x + (q.x - p.x) * s / steps, p.y + (q.y - p.y) * s / steps);
  });
 }
 return mask;
}
export type BrushPrompt = { points: [number, number][]; labels: number[]; box: { left: number; top: number; right: number; bottom: number } };
/**
 * Turn a brushed mask into SAM prompts: positive points spread over the brushed area, and negative points on a ring
 * around it (just outside its bounding box), so neighbouring things (a hand, a face, the table) are excluded.
 */
export function brushPrompts(mask: Uint8Array, width: number, height: number, maxPositives = 10): BrushPrompt {
 let left = width, top = height, right = -1, bottom = -1; const painted: number[] = [];
 for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % width, y = (i - x) / width; painted.push(i); if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
 if (!painted.length) throw Error('Brush over your object first.');
 // Positives: evenly spaced through the painted pixels (row-major order spreads them across the object).
 const step = Math.max(1, Math.floor(painted.length / maxPositives));
 const positives: [number, number][] = [];
 for (let k = Math.floor(step / 2); k < painted.length && positives.length < maxPositives; k += step) { const i = painted[k], x = i % width; positives.push([x, (i - x) / width]); }
 // Negatives: corners and edge midpoints of the box grown by a quarter of its size, skipping painted pixels.
 const margin = Math.max(12, 0.25 * Math.max(right - left, bottom - top));
 const box = { left: Math.max(0, left - margin), top: Math.max(0, top - margin), right: Math.min(width - 1, right + margin), bottom: Math.min(height - 1, bottom + margin) };
 const midX = (box.left + box.right) / 2, midY = (box.top + box.bottom) / 2;
 const negatives = ([[box.left, box.top], [midX, box.top], [box.right, box.top], [box.right, midY], [box.right, box.bottom], [midX, box.bottom], [box.left, box.bottom], [box.left, midY]] as [number, number][])
  .filter(([x, y]) => !mask[Math.round(y) * width + Math.round(x)]);
 return { points: [...positives, ...negatives], labels: [...positives.map(() => 1), ...negatives.map(() => 0)], box };
}
/**
 * Choose the SAM mask for the brushing. SAM's candidates are nested (part, object, object + hand or face). Parts
 * miss much of the painting; bigger regions add things the user did not paint. So take the smallest mask that still
 * covers at least 70% of the painted pixels. Returns -1 when none does (then the painting itself is used).
 */
export function chooseBrushedMask(masks: Uint8Array, size: number, painted: Uint8Array): number {
 let paintedArea = 0; for (let i = 0; i < size; i++) paintedArea += painted[i];
 let best = -1, bestArea = Infinity;
 for (let k = 0; (k + 1) * size <= masks.length; k++) {
  let area = 0, covered = 0;
  for (let i = 0; i < size; i++) if (masks[k * size + i]) { area++; if (painted[i]) covered++; }
  if (paintedArea && covered / paintedArea >= 0.7 && area < bestArea) { best = k; bestArea = area; }
 }
 return best;
}
/** Keep the parts of `mask` connected to painted pixels (4-connected flood fill from the painting). */
export function regionTouching(mask: Uint8Array, painted: Uint8Array, width: number, height: number): Uint8Array {
 const keep = new Uint8Array(mask.length), stack: number[] = [];
 for (let i = 0; i < mask.length; i++) if (mask[i] && painted[i]) { keep[i] = 1; stack.push(i); }
 while (stack.length) {
  const i = stack.pop()!, x = i % width, y = (i - x) / width;
  for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) if (j >= 0 && mask[j] && !keep[j]) { keep[j] = 1; stack.push(j); }
 }
 return keep;
}
