import { unpackObjectProfile, type ObjectProfile } from './object-profile.ts';
import type { ObjectScan } from './object-scan.ts';

// Deliberately conservative prototype policy; these are not calibrated confidence values.
export const OBJECT_DETAIL_POLICY = { minimumContrast: 0.08, minimumCells: 8, similarity: 0.72, coverage: 0.70 } as const;

function detailVectors(profile: ObjectProfile, scan?:ObjectScan) {
 // The v1 decoder repeats each of the 32 stored cells eight times. Read the
 // original cell order directly; never repool this expanded representation.
 const patches = unpackObjectProfile(profile).patches.filter((_, i) => i % 8 === 0);
 const active=patches.filter((_,i)=>!scan||scan.foreground[i]>=0.25);
 const mean = Array.from({ length: 384 }, (_, i) => active.reduce((sum, patch) => sum + patch[i], 0) / Math.max(1,active.length));
 return patches.map((patch,index) => {
  if(scan&&scan.foreground[index]<0.25)return null;
  // Remove the descriptor component shared across this image (e.g. white
  // background or generic colour). Match local deviations, not that common signal.
  const residual = patch.map((value, i) => value - mean[i]);
  const norm = Math.hypot(...residual);
  return norm >= OBJECT_DETAIL_POLICY.minimumContrast ? residual.map(value => value / norm) : null;
 });
}

export function compareObjectDetails(reference: ObjectProfile, candidate: ObjectProfile, referenceScan?:ObjectScan, candidateScan?:ObjectScan) {
 const a = detailVectors(reference,referenceScan), b = detailVectors(candidate,candidateScan);
 const referenceCells = a.filter(Boolean).length, candidateCells = b.filter(Boolean).length;
 const edges = a.map((patch, i) => b.flatMap((other, j) => {
  // Cropped objects should keep roughly the same orientation. Allow one grid
  // cell of framing drift, but do not move a cap/detail anywhere in the image.
  if (!patch || !other || Math.abs(i % 4 - j % 4) > 1 || Math.abs(Math.floor(i / 4) - Math.floor(j / 4)) > 1) return [];
  const similarity = patch.reduce((sum, value, k) => sum + value * other[k], 0);
  return similarity >= OBJECT_DETAIL_POLICY.similarity ? [j] : [];
 }));
 // Maximum bipartite matching: each candidate cell can explain only ONE
 // reference cell. Augmenting paths avoid greedy, order-dependent assignments.
 const owners = Array<number>(32).fill(-1);
 function assign(i: number, seen: Set<number>): boolean {
  for (const j of edges[i]) {
   if (seen.has(j)) continue;
   seen.add(j);
   if (owners[j] === -1 || assign(owners[j], seen)) { owners[j] = i; return true; }
  }
  return false;
 }
 const pairs = a.reduce((count, _, i) => count + Number(assign(i, new Set())), 0);
 const coverage = pairs / Math.max(referenceCells, candidateCells, 1);
 const sufficientDetail = Math.min(referenceCells, candidateCells) >= OBJECT_DETAIL_POLICY.minimumCells;
 // An aligned crop should have a coherent translation. This is intentionally
 // NOT a homography claim for a rotated 3D object: request an overlapping view.
 // Fit geometry over ALL eligible correspondences, not over an arbitrary
 // maximum matching selected first. For a fixed grid translation each source
 // cell has exactly one destination, so these pairs are already one-to-one.
 const eligible=edges.flatMap((destinations,i)=>destinations.map(j=>({i,j,dx:j%4-i%4,dy:Math.floor(j/4)-Math.floor(i/4)})));
 let coherent:typeof eligible=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
  const consistent=eligible.filter(p=>p.dx===dx&&p.dy===dy);
  if(consistent.length>coherent.length)coherent=consistent;
 }
 const inliers=coherent.length;
 const inlierRatio=inliers/Math.max(1,pairs);
 const region=(i:number)=>Number(i%4>=2)+2*Number(Math.floor(i/4)>=4);
 const occupied=new Set(coherent.map(p=>region(p.i))).size;
 const available=new Set(a.flatMap((p,i)=>p?[region(i)]:[])).size;
 const regionCoverage=occupied/Math.max(1,available);
 const geometryPass=!referenceScan||!candidateScan||(inliers>=8&&inlierRatio>=0.7&&regionCoverage>=0.5);
 return { referenceCells, candidateCells, pairs, coverage, sufficientDetail, inliers, inlierRatio, regionCoverage, geometryPass,
  matched: sufficientDetail && pairs >= OBJECT_DETAIL_POLICY.minimumCells && coverage >= OBJECT_DETAIL_POLICY.coverage && geometryPass };
}
