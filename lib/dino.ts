// Browser-side object feature matching.
// See THIRD_PARTY_NOTICES.md. Similarity is a demo check, never a key or authorization.
export const DINO_MODEL = 'Xenova/dinov2-small';
export const DINO_REVISION = 'c2bb04a51fab207c420665f1946016107bffc701';
export const DINO_RUNTIME_VERSION = '1.31.0-dev.20260914-8d85527a0';
// Conservative demo policy, not a calibrated probability or authentication boundary.
// The original 0.50 rule accepted weak matches; 0.82 is still uncalibrated.
export const DINO_THRESHOLD = 0.82;
export const DINO_DIMENSIONS = 384;
export const DINO_PATCHES = 256;
export type DinoFeatures = { version: 1; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; cls: number[]; patches: number[][]; scan?: import('./object-scan.ts').ObjectScan };

function normalize(vector: number[]): number[] {
 if (vector.length !== DINO_DIMENSIONS || !vector.every(Number.isFinite)) throw Error('Invalid DINOv2 features.');
 const norm = Math.hypot(...vector);
 if (norm < 1e-12) throw Error('Empty DINOv2 features.');
 return vector.map(value => value / norm);
}

export function featuresFromTokens(values: ArrayLike<number>, dimensions: readonly number[]): DinoFeatures {
 if (dimensions.join(',') !== `1,${DINO_PATCHES + 1},${DINO_DIMENSIONS}` || values.length !== (DINO_PATCHES + 1) * DINO_DIMENSIONS) {
  throw Error('Unexpected DINOv2 output. Expected 224 × 224 input and 384-dimensional tokens.');
 }
 const tokens = Array.from({ length: DINO_PATCHES + 1 }, (_, i) => normalize(Array.from({ length: DINO_DIMENSIONS }, (_, j) => values[i * DINO_DIMENSIONS + j])));
 return { version: 1, model: DINO_MODEL, revision: DINO_REVISION, cls: tokens[0], patches: tokens.slice(1) };
}

export function validDinoFeatures(value: unknown): value is DinoFeatures {
 if (!value || typeof value !== 'object') return false;
 const v = value as DinoFeatures;
 const vector = (x: unknown): x is number[] => Array.isArray(x) && x.length === DINO_DIMENSIONS && x.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(Math.hypot(...x) - 1) < 0.001;
 return v.version === 1 && v.model === DINO_MODEL && v.revision === DINO_REVISION && vector(v.cls) && Array.isArray(v.patches) && v.patches.length === DINO_PATCHES && v.patches.every(vector);
}

function dot(a: number[], b: number[]) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }

export function compareDinoFeatures(enrolled: DinoFeatures, candidate: DinoFeatures) {
 if (!validDinoFeatures(enrolled) || !validDinoFeatures(candidate)) throw Error('Invalid or incompatible object template.');
 return scoreTokens(dot(enrolled.cls,candidate.cls),enrolled.patches,candidate.patches);
}

// Only for the decoder's known 32-cell representation. Compute 32×32 dot
// products instead of repeating each one 64 times, preserving score weighting.
export function compareCompactDinoFeatures(enrolled:DinoFeatures,candidate:DinoFeatures) {
 if(!validDinoFeatures(enrolled)||!validDinoFeatures(candidate))throw Error('Invalid or incompatible object template.');
 return scoreTokens(dot(enrolled.cls,candidate.cls),enrolled.patches.filter((_,i)=>i%8===0),candidate.patches.filter((_,i)=>i%8===0),8);
}

function scoreTokens(global:number,a:number[][],b:number[][],repeats=1) {
 const matrix = a.map(patch => b.map(other => dot(patch, other)));
 const best = matrix.map(row => Math.max(...row));
 // Full coverage in BOTH directions: one generic/background patch must not
 // stand in for the whole object. Keep the historical score separately for diagnostics.
 const forward = best.reduce((sum, value) => sum + value, 0) / best.length;
 const reverse = b.reduce((sum, _, i) => sum + Math.max(...matrix.map(row => row[i])), 0) / b.length;
 const agreement = Math.max(-1, Math.min(1, Math.min(forward, reverse)));
 best.sort((a, b) => b - a);
 const weighted=best.flatMap(value=>Array<number>(repeats).fill(value));
 const count = Math.max(1, Math.floor(weighted.length * 0.35));
 const patches = weighted.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
 const score = Math.max(-1, Math.min(1, 0.5 * global + 0.5 * patches));
 return { global, patches, score, agreement, matched: score >= DINO_THRESHOLD && global >= DINO_THRESHOLD && agreement >= DINO_THRESHOLD };
}
