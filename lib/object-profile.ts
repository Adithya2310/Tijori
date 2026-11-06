import { DINO_MODEL, DINO_REVISION, validDinoFeatures, type DinoFeatures } from './dino.ts';
import { OBJECT_PREPROCESS_VERSION, validObjectScan, scanQualityReason, type ObjectScan } from './object-scan.ts';
export type SingleObjectProfile = { version: 1; encoding: 'sam-q8-grid32'; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; data: string };
export type MultiObjectProfile = { version: 2; encoding: 'sam-multiview-grid32'; model: typeof DINO_MODEL; revision: typeof DINO_REVISION; data: string; scan: ObjectScan; views: { data: string; scan: ObjectScan }[]; protection: 'object-demo-v1' };
export type ObjectProfile = SingleObjectProfile | MultiObjectProfile;
// 32 spatial patch pools + CLS, normalized and quantized. ~17 KB per identity,
// rather than uploading the multi-megabyte JSON feature map or original photo.
export function packObjectProfile(features: DinoFeatures): SingleObjectProfile {
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
 const data=(s:unknown):s is string=>{
  if(typeof s!=='string'||s.length!==16896||!/^[A-Za-z0-9+/]+$/.test(s))return false;
  const decoded=atob(s);
  for(let offset=0;offset<decoded.length;offset+=384){let nonzero=false;for(let i=0;i<384;i++)if(decoded.charCodeAt(offset+i)!==0){nonzero=true;break;}if(!nonzero)return false;}
  return true;
 };
 if(v.model!==DINO_MODEL||v.revision!==DINO_REVISION||!data(v.data))return false;
 if(v.version===1)return v.encoding==='sam-q8-grid32'&&Object.keys(v).sort().join(',')==='data,encoding,model,revision,version';
 if(v.version!==2||v.encoding!=='sam-multiview-grid32'||v.protection!=='object-demo-v1'||!validObjectScan(v.scan)||!Array.isArray(v.views)||v.views.length<3||v.views.length>7||!v.views.every(view=>!!view&&data(view.data)&&validObjectScan(view.scan)))return false;
 if(Object.keys(v).sort().join(',')!=='data,encoding,model,protection,revision,scan,version,views'||v.views.some(view=>Object.keys(view).sort().join(',')!=='data,scan'))return false;
 const scans=[v.scan,...v.views.map(view=>view.scan)];
 // Stored schema validation is independent of tunable quality policy. A
 // policy update may reject recognition, but must not destroy key readability.
 return scans.every(s=>s.preprocess===OBJECT_PREPROCESS_VERSION&&s.category.label===v.scan.category.label)&&new Set(scans.map(s=>s.imageId)).size===scans.length;
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
 return { version: 1, model: DINO_MODEL, revision: DINO_REVISION, cls: vectors[0], patches: vectors.slice(1).flatMap(vector => Array.from({ length: 8 }, () => [...vector])), ...(profile.version===2?{scan:profile.scan}:{}) };
}

export function objectProfileViews(profile: ObjectProfile): { profile: SingleObjectProfile; scan?: ObjectScan }[] {
 const single=(data:string):SingleObjectProfile=>({version:1,encoding:'sam-q8-grid32',model:DINO_MODEL,revision:DINO_REVISION,data});
 return profile.version===1?[{profile}]:[{profile:single(profile.data),scan:profile.scan},...profile.views.map(view=>({profile:single(view.data),scan:view.scan}))];
}

export function packMultiObjectProfile(photos: DinoFeatures[], protection: MultiObjectProfile['protection']): MultiObjectProfile {
 if(photos.length<4||photos.length>8)throw Error('Capture four to eight distinct views of one object.');
 const views=photos.map(photo=>{
  if(!photo.scan||scanQualityReason(photo.scan))throw Error('Every view needs a clear, isolated, supported object. Retake the view.');
  return {data:packObjectProfile(photo).data,scan:photo.scan};
 });
 return multiProfileFromViews(views,protection);
}

export function multiProfileFromViews(views:{data:string;scan:ObjectScan}[],protection:MultiObjectProfile['protection']='object-demo-v1'):MultiObjectProfile {
 if(views.length<4||views.length>8||views.some(view=>scanQualityReason(view.scan)))throw Error('Capture four to eight clear, isolated views.');
 const [first,...rest]=views;
 const result:MultiObjectProfile={version:2,encoding:'sam-multiview-grid32',model:DINO_MODEL,revision:DINO_REVISION,...first,views:rest,protection};
 if(!validObjectProfile(result))throw Error('Use distinct camera captures of the same object category for every view.');
 return result;
}
