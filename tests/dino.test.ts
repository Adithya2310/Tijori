import test from 'node:test';
import assert from 'node:assert/strict';
import { featuresFromTokens, compareDinoFeatures, validDinoFeatures, DINO_DIMENSIONS, DINO_PATCHES } from '../lib/dino.ts';

function features(axis: number) {
 const tokens = new Float32Array((DINO_PATCHES + 1) * DINO_DIMENSIONS);
 for (let i = 0; i <= DINO_PATCHES; i++) tokens[i * DINO_DIMENSIONS + axis] = 2;
 return featuresFromTokens(tokens, [1, 257, 384]);
}

test('normalizes tokens and accepts identical object features', () => {
 const enrolled = features(0);
 assert.equal(enrolled.cls[0], 1);
 assert.ok(validDinoFeatures(enrolled));
 assert.deepEqual(compareDinoFeatures(enrolled, enrolled), { global: 1, patches: 1, score: 1, agreement: 1, matched: true });
});

test('rejects orthogonal features and malformed or incompatible templates', () => {
 assert.equal(compareDinoFeatures(features(0), features(1)).matched, false);
 assert.equal(validDinoFeatures({ ...features(0), model: 'other' }), false);
 assert.equal(validDinoFeatures({ ...features(0), cls: Array(384).fill(NaN) }), false);
 assert.throws(() => featuresFromTokens(new Float32Array(384), [1, 384]));
 assert.throws(() => featuresFromTokens(new Float32Array(257 * 384), [1, 257, 384]));
});

test('Historical patch score averages the top 35% best matches, independently of patch position', () => {
 const enrolled = features(0), candidate = features(1);
 // 89 / 256 patches = floor(35%). Each finds the sole matching candidate patch.
 candidate.patches[255] = [...enrolled.patches[0]];
 const orthogonal = features(2).cls;
 for (let i = 89; i < 256; i++) enrolled.patches[i] = orthogonal;
 const result = compareDinoFeatures(enrolled, candidate);
 assert.equal(result.global, 0);
 assert.equal(result.patches, 1);
 assert.equal(result.score, 0.5);
 assert.equal(result.matched, false, 'one patch must not grant login, even though the original rule grants at 0.50');
});

test('rejects the reported 60 percent similarity instead of treating it as confidence', () => {
 const enrolled = features(0), candidate = features(1);
 const vector = Array(384).fill(0); vector[0] = 0.6; vector[1] = 0.8;
 candidate.cls = [...vector]; candidate.patches = candidate.patches.map(() => [...vector]);
 const result = compareDinoFeatures(enrolled, candidate);
 assert.ok(Math.abs(result.score - 0.6) < 1e-6);
 assert.equal(result.matched, false);
});

test('requires strong global agreement even when local patches all match', () => {
 const enrolled = features(0), candidate = features(0);
 candidate.cls = features(1).cls;
 candidate.cls[0] = 0.75; candidate.cls[1] = Math.sqrt(1 - 0.75 ** 2);
 const result = compareDinoFeatures(enrolled, candidate);
 assert.ok(result.score > 0.82);
 assert.equal(result.matched, false);
});

test('requires full two-way coverage despite a high historical score and identical CLS', () => {
 const enrolled = features(0), candidate = features(1);
 candidate.cls = [...enrolled.cls];
 candidate.patches[255] = [...enrolled.patches[0]];
 assert.equal(compareDinoFeatures(enrolled,candidate).score, 1, 'one-way historical score alone grants this scan');
 for (const [a,b] of [[enrolled,candidate],[candidate,enrolled]]) {
  const result = compareDinoFeatures(a,b);
  assert.equal(result.global, 1);
  assert.ok(result.agreement < 0.01);
  assert.equal(result.matched, false);
 }
});

test('accepts strong matching features without depending on patch position', () => {
 const enrolled = features(0), candidate = features(0);
 const vectors = Array.from({length:8}, (_,i) => features(i).cls);
 enrolled.patches = enrolled.patches.map((_, i) => vectors[i % 8]);
 candidate.patches = [...enrolled.patches].reverse();
 const result = compareDinoFeatures(enrolled,candidate);
 assert.equal(result.matched, true);
});
