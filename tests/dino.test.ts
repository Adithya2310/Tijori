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
 assert.deepEqual(compareDinoFeatures(enrolled, enrolled), { global: 1, patches: 1, score: 1, matched: true });
});

test('rejects orthogonal features and malformed or incompatible templates', () => {
 assert.equal(compareDinoFeatures(features(0), features(1)).matched, false);
 assert.equal(validDinoFeatures({ ...features(0), model: 'other' }), false);
 assert.equal(validDinoFeatures({ ...features(0), cls: Array(384).fill(NaN) }), false);
 assert.throws(() => featuresFromTokens(new Float32Array(384), [1, 384]));
 assert.throws(() => featuresFromTokens(new Float32Array(257 * 384), [1, 257, 384]));
});

test('VILA patch score averages the top 35% best matches, independently of patch position', () => {
 const enrolled = features(0), candidate = features(1);
 // 89 / 256 patches = floor(35%). Each finds the sole matching candidate patch.
 candidate.patches[255] = [...enrolled.patches[0]];
 const orthogonal = features(2).cls;
 for (let i = 89; i < 256; i++) enrolled.patches[i] = orthogonal;
 const result = compareDinoFeatures(enrolled, candidate);
 assert.equal(result.global, 0);
 assert.equal(result.patches, 1);
 assert.equal(result.score, 0.5);
 assert.equal(result.matched, true);
});
