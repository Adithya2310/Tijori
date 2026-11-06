import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { regionAt, squareCrop, poolForeground, PATCH_GRID, OBJECT_NOT_FOUND } from '@tijori/client/object-geometry';
import { createObjectIdentityV2, unlockObjectIdentityV2, parseObjectRecoveryV2 } from '@tijori/client/dino-wallet';
import { listDeviceIdentities, saveDeviceIdentity } from '@tijori/client/device-identities';
import { packObjectProfileV2 } from '@tijori/core/object-profile';

test('the region at the prompt point is kept, other regions are dropped', () => {
 // Two separate blobs in a 10 × 6 mask; the seed sits in the smaller one on the right.
 const w = 10, h = 6, mask = new Uint8Array(w * h);
 for (let y = 1; y < 5; y++) for (let x = 0; x < 5; x++) mask[y * w + x] = 1;
 for (let y = 2; y < 4; y++) for (let x = 7; x < 9; x++) mask[y * w + x] = 1;
 const right = regionAt(mask, w, h, { x: 8, y: 3 });
 assert.equal(right.reduce((a, b) => a + b, 0), 4);
 assert.equal(right[3 * w + 8], 1); assert.equal(right[2 * w + 2], 0);
 const fallback = regionAt(mask, w, h, { x: 6, y: 0 });
 assert.equal(fallback.reduce((a, b) => a + b, 0), 20, 'seed outside every region keeps the largest (4 × 5)');
});

test('the crop is padded to a square around the object (never stretched) and coverage maps to the patch grid', () => {
 const w = 64, h = 64, region = new Uint8Array(w * h);
 for (let y = 8; y < 56; y++) for (let x = 28; x < 36; x++) region[y * w + x] = 1; // a tall, thin "pen"
 const crop = squareCrop(region, w, h)!;
 assert.ok(crop.side >= 48, 'square side follows the longest edge');
 assert.equal(crop.grid.length, PATCH_GRID * PATCH_GRID);
 const covered = Array.from(crop.grid).filter(c => c > 0).length;
 assert.ok(covered > 8 && covered < 80, `a thin object covers a central column of patches (${covered})`);
 assert.ok(Math.abs(crop.objectFraction - 384 / 4096) < 1e-9);
 assert.equal(squareCrop(new Uint8Array(w * h), w, h), null);
});

test('foreground pooling ignores background patches entirely', () => {
 const dims = [1, 257, 384], tokens = new Float32Array(257 * 384);
 tokens[0] = 1; // CLS
 const grid = new Float32Array(256);
 for (let p = 0; p < 256; p++) { const object = p < 10; grid[p] = object ? 1 : 0; tokens[(p + 1) * 384 + (object ? 1 : 2)] = 1; }
 const pooled = poolForeground(tokens, dims, grid);
 assert.equal(pooled.foregroundPatches, 10);
 assert.ok(pooled.fg[1] > 0 && pooled.fg[2] === 0, 'background direction contributes nothing');
 assert.throws(() => poolForeground(tokens, dims, new Float32Array(256)), new RegExp(OBJECT_NOT_FOUND.slice(0, 20)));
 assert.throws(() => poolForeground(tokens, [1, 10, 384], grid), /Unexpected/);
});

test('v2 identities are remembered on the device and unlock only with their profile', async () => {
 const view = (k: number) => ({ cls: Array.from({ length: 384 }, (_, i) => Math.sin(i * k + 1)), fg: Array.from({ length: 384 }, (_, i) => Math.cos(i * k + 2)) });
 const profile = packObjectProfileV2([view(1), view(2)]);
 const recovery = await createObjectIdentityV2(profile);
 assert.deepEqual(parseObjectRecoveryV2(JSON.parse(JSON.stringify(recovery))), recovery);
 const signer = await unlockObjectIdentityV2(recovery.address, recovery.keyEnvelope, profile);
 assert.equal(signer.address.toLowerCase(), recovery.address);
 await assert.rejects(unlockObjectIdentityV2(recovery.address, recovery.keyEnvelope, packObjectProfileV2([view(3)])));
 await saveDeviceIdentity({ version: 1, name: 'sub', status: 'pending', recovery });
 const saved = (await listDeviceIdentities()).find(item => item.recovery.address === recovery.address)!;
 assert.equal(saved.recovery.version, 2);
});

test('mask choice prefers the whole object over the part under the point, and never the whole frame', async () => {
 const { chooseMask } = await import('@tijori/client/object-geometry');
 const size = 100, seed = 55, masks = new Uint8Array(size * 3);
 for (let i = 50; i < 60; i++) masks[i] = 1;            // mask 0: the label under the point (10%)
 for (let i = 20; i < 80; i++) masks[size + i] = 1;     // mask 1: the whole bottle (60%)
 for (let i = 0; i < 100; i++) masks[2 * size + i] = 1; // mask 2: everything (100%)
 assert.equal(chooseMask(masks, [0.95, 0.9, 0.99], size, seed), 1, 'without a circle, the larger confident object mask wins');
 assert.equal(chooseMask(masks, [0.95, 0.5, 0.99], size, seed), 0, 'a low-confidence large mask is not preferred');
});

test('inside the guide circle, the object wins over the hand and person holding it', async () => {
 const { chooseMask, guideDisc } = await import('@tijori/client/object-geometry');
 const w = 40, h = 30, size = w * h, disc = guideDisc(w, h), seed = 15 * w + 20;
 const masks = new Uint8Array(size * 3);
 for (let y = 9; y < 22; y++) for (let x = 16; x < 25; x++) masks[y * w + x] = 1;                       // 0: the bottle, inside the circle
 for (let y = 9; y < 30; y++) for (let x = 2; x < 38; x++) if (y > 12 || (x > 15 && x < 25)) masks[size + y * w + x] = 1; // 1: bottle + hand + person
 for (let y = 14; y < 17; y++) for (let x = 16; x < 25; x++) masks[2 * size + y * w + x] = 1;          // 2: the label only
 assert.equal(chooseMask(masks, [0.9, 0.97, 0.95], size, seed, disc), 0);
 assert.ok(disc.reduce((a, b) => a + b, 0) / size < 0.5, 'the circle covers well under half a landscape photo');
});

test('brushing becomes SAM prompts, and the smallest mask covering the painting wins', async () => {
 const g = await import('@tijori/client/object-geometry');
 const w = 100, h = 80, size = w * h;
 const brush = { radius: 0.05, strokes: [[{ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 }]] };
 assert.ok(g.validBrush(brush)); assert.equal(g.validBrush({ radius: 0.05, strokes: [] }), false); assert.equal(g.validBrush({ radius: 0.05, strokes: [[{ x: 2, y: 0 }]] }), false);
 const painted = g.rasterizeBrush(brush, w, h);
 const area = painted.reduce((a, b) => a + b, 0);
 assert.ok(area > 100 && area < 600, `a short thick stroke (${area} px)`);
 const prompt = g.brushPrompts(painted, w, h);
 const positives = prompt.points.filter((_, i) => prompt.labels[i] === 1), negatives = prompt.points.filter((_, i) => prompt.labels[i] === 0);
 assert.ok(positives.length >= 5 && positives.every(([x, y]) => painted[Math.round(y) * w + Math.round(x)]), 'positives lie on the painting');
 assert.ok(negatives.length >= 4 && negatives.every(([x, y]) => !painted[Math.round(y) * w + Math.round(x)]), 'negatives lie off the painting');
 // Nested masks: the stroke's object (column 44–56), object + hand (wider), and a part (a small square).
 const masks = new Uint8Array(size * 3);
 for (let y = 20; y < 60; y++) for (let x = 44; x < 57; x++) masks[y * w + x] = 1;
 for (let y = 15; y < 80; y++) for (let x = 20; x < 90; x++) masks[size + y * w + x] = 1;
 for (let y = 38; y < 44; y++) for (let x = 46; x < 54; x++) masks[2 * size + y * w + x] = 1;
 assert.equal(g.chooseBrushedMask(masks, size, painted), 0);
 assert.equal(g.chooseBrushedMask(masks.slice(2 * size), size, painted), -1, 'a part alone does not cover the painting');
 const kept = g.regionTouching(masks.subarray(size, 2 * size), painted, w, h);
 assert.equal(kept.reduce((a, b) => a + b, 0), 70 * 65, 'the connected region touching the painting is kept');
});
