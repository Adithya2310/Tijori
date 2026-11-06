// Scanner v2 matching: compares a login photo's descriptor with an enrolled profile. Pure and isomorphic, so the
// server makes the decision (the browser only computes descriptors). It distinguishes different objects; it cannot
// tell identical, same-model objects apart and is not authentication.
import { unpackObjectView, validObjectProfileV2, validObjectQuery, type ObjectProfileV2, type ObjectQuery, type UnpackedView } from './object-profile.ts';

/** Weight of the CLS similarity; the rest is the foreground (object-only) similarity. Set from calibration. */
export const OBJECT_MATCH_CLS_WEIGHT = 0.5;
/** Minimum combined similarity for a match. Real photos of different objects score 0.12–0.33; same-object retakes from
 * other angles score well above that, so 0.55 keeps a safe gap while accepting natural angle and lighting changes. */
export const OBJECT_MATCH_THRESHOLD = 0.55;
export type ObjectMatchOptions = { threshold?: number; clsWeight?: number };
export type ObjectViewScore = { view: number; score: number; cls: number; fg: number };
export type ObjectMatch = ObjectViewScore & { matched: boolean; threshold: number };

const dot = (a: Float32Array, b: Float32Array) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; };
/** Similarity of two unpacked views: weighted CLS and foreground cosine similarity. */
export function compareObjectViews(a: UnpackedView, b: UnpackedView, clsWeight = OBJECT_MATCH_CLS_WEIGHT) {
 const cls = dot(a.cls, b.cls), fg = dot(a.fg, b.fg);
 return { score: clsWeight * cls + (1 - clsWeight) * fg, cls, fg };
}
/** Best-matching enrolled view for a query, and whether it clears the threshold. */
export function matchObjectProfile(profile: ObjectProfileV2, query: ObjectQuery, options: ObjectMatchOptions = {}): ObjectMatch {
 if (!validObjectProfileV2(profile)) throw Error('Invalid stored object profile.');
 if (!validObjectQuery(query)) throw Error('Invalid object photo descriptor.');
 const threshold = options.threshold ?? OBJECT_MATCH_THRESHOLD, clsWeight = options.clsWeight ?? OBJECT_MATCH_CLS_WEIGHT;
 const probe = unpackObjectView(query.view);
 let best: ObjectViewScore = { view: -1, score: -Infinity, cls: -Infinity, fg: -Infinity };
 profile.views.forEach((view, index) => {
  const result = compareObjectViews(unpackObjectView(view), probe, clsWeight);
  if (result.score > best.score) best = { view: index, ...result };
 });
 return { ...best, matched: best.score >= threshold, threshold };
}
