import { DINO_MODEL, DINO_REVISION, validDinoFeatures, type DinoFeatures } from './dino.ts';
export type ObjectProfile = { version: 1; encoding: 'sam-q8-grid32'; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; data: string };
// 32 spatial patch pools + CLS, normalized and quantized. ~17 KB per identity,
// rather than uploading the multi-megabyte JSON feature map or original photo.
export function packObjectProfile(features: DinoFeatures): ObjectProfile {
 if (!validDinoFeatures(features)) throw Error('Invalid object features.');
 const vectors = [features.cls];
 for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
  const vector = Array(384).fill(0) as number[];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) {
   const patch = features.patches[(y * 2 + dy) * 16 + x * 4 + dx];
   for (let i = 0; i < 384; i++) vector[i] += patch[i];
  }
  const norm = Math.hypot(...vector);
  if (norm < 1e-12) throw Error('The object has empty spatial features.');
  vectors.push(vector.map(n => n / norm));
 }
 const data = vectors.flat().map(n => Math.max(-127, Math.min(127, Math.round(n * 127))));
 return { version: 1, encoding: 'sam-q8-grid32', model: DINO_MODEL, revision: DINO_REVISION, data: btoa(String.fromCharCode(...data.map(n => n & 255))) };
}
export function validObjectProfile(value: unknown): value is ObjectProfile {
 if (!value || typeof value !== 'object') return false;
 const v = value as ObjectProfile;
 return v.version === 1 && v.encoding === 'sam-q8-grid32' && v.model === DINO_MODEL && v.revision === DINO_REVISION && typeof v.data === 'string' && v.data.length === 16896 && /^[A-Za-z0-9+/]+$/.test(v.data);
}
export function unpackObjectProfile(profile: ObjectProfile): DinoFeatures {
 if (!validObjectProfile(profile)) throw Error('Invalid stored object profile.');
 const data = atob(profile.data);
 const vectors = Array.from({ length: 33 }, (_, index) => {
  const vector = Array.from({ length: 384 }, (_, i) => { const n = data.charCodeAt(index * 384 + i); return n > 127 ? n - 256 : n; });
  const norm = Math.hypot(...vector);
  if (norm < 1e-12) throw Error('Invalid empty object profile.');
  return vector.map(n => n / norm);
 });
 return { version: 1, model: DINO_MODEL, revision: DINO_REVISION, cls: vectors[0], patches: vectors.slice(1).flatMap(vector => Array.from({ length: 8 }, () => [...vector])) };
}

// ---------- Scanner v2: foreground-only descriptors, matched on the server ----------
// Each view is the DINOv2 CLS token plus the mean of the patch tokens that cover the isolated object (background
// excluded), both L2-normalised and quantised to int8: 768 bytes, 1024 base64 characters (~1 KB) per view.
export const OBJECT_VIEW_DIMENSIONS = 384;
export const OBJECT_PROFILE_ENCODING = 'dinov2-fg-q8' as const;
export const OBJECT_PROFILE_MAX_VIEWS = 5;
/** `object_name` of identities enrolled with scanner v2 (the value is a marker, not a secret). */
export const OBJECT_IDENTITY_NAME = 'dino-object-v2';
export type ObjectDescriptor = { cls: ArrayLike<number>; fg: ArrayLike<number> };
export type ObjectProfileV2 = { version: 2; encoding: typeof OBJECT_PROFILE_ENCODING; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; views: string[] };
/** A single login photo's descriptor, sent to the server for matching. */
export type ObjectQuery = { version: 2; encoding: typeof OBJECT_PROFILE_ENCODING; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; view: string };
/** Any profile a wallet may carry: legacy v1 (no longer accepted for login) or scanner v2. */
export type StoredObjectProfile = ObjectProfile | ObjectProfileV2;
export type UnpackedView = { cls: Float32Array; fg: Float32Array };

const VIEW_BYTES = OBJECT_VIEW_DIMENSIONS * 2, VIEW_CHARS = 1024;
function quantize(vector: ArrayLike<number>): number[] {
 if (vector.length !== OBJECT_VIEW_DIMENSIONS) throw Error('Invalid object descriptor size.');
 const values = Array.from(vector, Number);
 if (!values.every(Number.isFinite)) throw Error('Invalid object descriptor values.');
 const norm = Math.hypot(...values);
 if (norm < 1e-12) throw Error('Empty object descriptor.');
 return values.map(n => Math.max(-127, Math.min(127, Math.round(n / norm * 127))));
}
function normalised(values: Int8Array): Float32Array {
 let sum = 0; for (const n of values) sum += n * n;
 const norm = Math.sqrt(sum);
 if (norm < 1e-12) throw Error('Invalid empty object view.');
 return Float32Array.from(values, n => n / norm);
}
/** Quantise one view (CLS + foreground mean) to its 1024-character storage form. */
export function packObjectView(descriptor: ObjectDescriptor): string {
 const bytes = [...quantize(descriptor.cls), ...quantize(descriptor.fg)];
 return btoa(String.fromCharCode(...bytes.map(n => n & 255)));
}
export function unpackObjectView(view: string): UnpackedView {
 if (typeof view !== 'string' || view.length !== VIEW_CHARS || !/^[A-Za-z0-9+/]+$/.test(view)) throw Error('Invalid object view.');
 const raw = atob(view);
 if (raw.length !== VIEW_BYTES) throw Error('Invalid object view.');
 const signed = Int8Array.from(raw, ch => { const n = ch.charCodeAt(0); return n > 127 ? n - 256 : n; });
 return { cls: normalised(signed.subarray(0, OBJECT_VIEW_DIMENSIONS)), fg: normalised(signed.subarray(OBJECT_VIEW_DIMENSIONS)) };
}
const validView = (view: unknown) => { try { unpackObjectView(view as string); return true; } catch { return false; } };
const header = { encoding: OBJECT_PROFILE_ENCODING, model: DINO_MODEL, revision: DINO_REVISION } as const;
export function packObjectProfileV2(views: ObjectDescriptor[]): ObjectProfileV2 {
 if (!Array.isArray(views) || views.length < 1 || views.length > OBJECT_PROFILE_MAX_VIEWS) throw Error(`Scan 1–${OBJECT_PROFILE_MAX_VIEWS} views of the object.`);
 return { version: 2, ...header, views: views.map(packObjectView) };
}
export const packObjectQuery = (descriptor: ObjectDescriptor): ObjectQuery => ({ version: 2, ...header, view: packObjectView(descriptor) });
export function validObjectProfileV2(value: unknown): value is ObjectProfileV2 {
 if (!value || typeof value !== 'object') return false;
 const v = value as ObjectProfileV2;
 return v.version === 2 && v.encoding === OBJECT_PROFILE_ENCODING && v.model === DINO_MODEL && v.revision === DINO_REVISION && Object.keys(v).length === 5
  && Array.isArray(v.views) && v.views.length >= 1 && v.views.length <= OBJECT_PROFILE_MAX_VIEWS && v.views.every(validView) && new Set(v.views).size === v.views.length;
}
export function validObjectQuery(value: unknown): value is ObjectQuery {
 if (!value || typeof value !== 'object') return false;
 const v = value as ObjectQuery;
 return v.version === 2 && v.encoding === OBJECT_PROFILE_ENCODING && v.model === DINO_MODEL && v.revision === DINO_REVISION && Object.keys(v).length === 5 && validView(v.view);
}
export const validStoredObjectProfile = (value: unknown): value is StoredObjectProfile => validObjectProfileV2(value) || (validObjectProfile(value) && (() => { try { unpackObjectProfile(value); return true; } catch { return false; } })());
