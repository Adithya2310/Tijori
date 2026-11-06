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
