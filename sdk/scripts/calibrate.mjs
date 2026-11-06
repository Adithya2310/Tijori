// Calibrate scanner v2 matching from a labelled descriptor set (downloaded from examples/object-lab).
// Usage: npm run calibrate -- <calibration.json> [more.json ...]
// Simulates real use: enroll up to 3 photos of an object (like the sign-up scan), log in with another photo.
// Genuine = held-out photo of the same object; impostor = any photo of another object (same kind reported apart).
import { readFile } from 'node:fs/promises';
import { unpackObjectView } from '@tijori/core/object-profile';
import { compareObjectViews } from '@tijori/core/object-match';

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: npm run calibrate -- <calibration.json> [more.json ...]'); process.exit(1); }
const samples = (await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8')).samples))).flat()
 .map(s => ({ ...s, unpacked: unpackObjectView(s.view) }));
const labels = [...new Set(samples.map(s => s.label))];
const byLabel = new Map(labels.map(label => [label, samples.filter(s => s.label === label)]));
const categoryOf = new Map(samples.map(s => [s.label, s.category]));
console.log(`${samples.length} photos of ${labels.length} objects: ${labels.map(l => `${l} (${categoryOf.get(l)}) ×${byLabel.get(l).length}`).join(', ')}`);
if (labels.length < 2 || ![...byLabel.values()].some(list => list.length >= 2)) { console.error('Need at least 2 objects and 2 photos of one object.'); process.exit(1); }

const best = (enrolled, query, weight) => Math.max(...enrolled.map(e => compareObjectViews(e.unpacked, query.unpacked, weight).score));
function evaluate(weight) {
 const genuine = [], impostor = [];
 for (const [label, list] of byLabel) {
  // Leave-one-out: each photo logs in against up to 3 other photos of the same object.
  list.forEach((query, i) => { const enrolled = list.filter((_, j) => j !== i).slice(0, 3); if (enrolled.length) genuine.push({ label, score: best(enrolled, query, weight) }); });
  const enrolled = list.slice(0, 3);
  for (const query of samples.filter(s => s.label !== label)) impostor.push({ label, query: query.label, sameKind: query.category === categoryOf.get(label), score: best(enrolled, query, weight) });
 }
 const minGenuine = Math.min(...genuine.map(g => g.score)), maxImpostor = Math.max(...impostor.map(i => i.score));
 const sameKind = impostor.filter(i => i.sameKind), maxSameKind = sameKind.length ? Math.max(...sameKind.map(i => i.score)) : null;
 return { weight, genuine, impostor, minGenuine, maxImpostor, maxSameKind, gap: minGenuine - maxImpostor };
}
const results = Array.from({ length: 11 }, (_, i) => evaluate(i / 10));
console.log('\nCLS weight | worst genuine | best impostor | best same-kind impostor | gap');
for (const r of results) console.log(`${r.weight.toFixed(1).padStart(10)} | ${r.minGenuine.toFixed(3).padStart(13)} | ${r.maxImpostor.toFixed(3).padStart(13)} | ${(r.maxSameKind === null ? '—' : r.maxSameKind.toFixed(3)).padStart(23)} | ${r.gap.toFixed(3)}`);
const chosen = results.reduce((a, b) => (b.gap > a.gap ? b : a));
const rejectRate = threshold => chosen.genuine.filter(g => g.score < threshold).length / chosen.genuine.length;
const acceptRate = threshold => chosen.impostor.filter(i => i.score >= threshold).length / chosen.impostor.length;
// Wrong objects must never pass: place the threshold in the gap, nearer the impostors only when the gap is wide.
// Never recommend below 0.70: small calibration sets under-sample impostors.
const FLOOR = 0.7;
const threshold = Math.max(FLOOR, chosen.gap > 0 ? Math.round((chosen.maxImpostor + Math.min(0.06, chosen.gap / 2)) * 100) / 100 : Math.ceil((chosen.maxImpostor + 0.01) * 100) / 100);
console.log(`\nRecommended: OBJECT_MATCH_CLS_WEIGHT = ${chosen.weight.toFixed(1)}, OBJECT_MATCH_THRESHOLD = ${threshold.toFixed(2)}`);
console.log(`At that setting: ${(acceptRate(threshold) * 100).toFixed(1)}% of wrong-object logins accepted, ${(rejectRate(threshold) * 100).toFixed(1)}% of same-object logins rejected (${chosen.genuine.length} genuine, ${chosen.impostor.length} impostor attempts).`);
if (chosen.gap <= 0) console.log('Warning: genuine and impostor scores overlap. Retake blurry or off-centre photos, or add more angles.');
const hardest = [...chosen.impostor].sort((a, b) => b.score - a.score).slice(0, 3);
console.log('Closest wrong objects:', hardest.map(h => `${h.query} as ${h.label}: ${h.score.toFixed(3)}`).join('; '));
const weakest = [...chosen.genuine].sort((a, b) => a.score - b.score).slice(0, 3);
console.log('Hardest same-object logins:', weakest.map(w => `${w.label}: ${w.score.toFixed(3)}`).join('; '));
