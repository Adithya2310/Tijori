import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDinoFeatures } from '../lib/dino.ts';
import { compareObjectDetails } from '../lib/object-detail.ts';
import { packObjectProfile, unpackObjectProfile } from '../lib/object-profile.ts';
import { createObjectIdentity, verifyObjectRecovery, unlockObjectIdentity } from '../lib/dino-wallet.ts';
import { objectFeatures } from './fixtures/object-features.ts';

test('rejects different local detail despite identical global features and very high cosine similarity', async () => {
 const reference = objectFeatures(), different = objectFeatures(64);
 different.cls = [...reference.cls];
 // Share the strong generic component; keep unrelated fine detail.
 different.patches = different.patches.map(patch => { const vector = [...patch]; vector[0]=vector[64]; vector[64]=0; return vector; });
 const a = packObjectProfile(reference), b = packObjectProfile(different);
 assert.ok(compareDinoFeatures(unpackObjectProfile(a),unpackObjectProfile(b)).matched, 'global/uncentered checks alone accept this impostor');
 assert.equal(compareObjectDetails(a,b).matched,false);
 assert.equal(compareObjectDetails(b,a).matched,false);
 const recovery = await createObjectIdentity(unpackObjectProfile(a),a);
 await assert.rejects(verifyObjectRecovery(recovery,different),/local details/);
 assert.ok((await verifyObjectRecovery(recovery,reference)).matched);
});

test('accepts small descriptor noise but rejects distant rearrangement of identical details', () => {
 const reference=objectFeatures(), noisy=structuredClone(reference), rearranged=structuredClone(reference);
 noisy.patches=noisy.patches.map(patch => { const vector=[...patch]; vector[200]=0.02; const n=Math.hypot(...vector); return vector.map(v=>v/n); });
 for(let y=0;y<16;y++)for(let x=0;x<16;x++)rearranged.patches[y*16+x]=reference.patches[((y+8)%16)*16+x];
 const profile=packObjectProfile(reference);
 assert.equal(compareObjectDetails(profile,packObjectProfile(noisy)).matched,true);
 assert.equal(compareDinoFeatures(unpackObjectProfile(profile),unpackObjectProfile(packObjectProfile(rearranged))).matched,true);
 assert.equal(compareObjectDetails(profile,packObjectProfile(rearranged)).matched,false);
});

test('rejects featureless enrollment and low-detail login without changing legacy key access', async () => {
 const flat=objectFeatures(); flat.patches=flat.patches.map(()=>[...flat.cls]);
 const profile=packObjectProfile(flat);
 const detail=compareObjectDetails(profile,profile);
 assert.equal(detail.sufficientDetail,false);
 assert.equal(detail.matched,false);
 await assert.rejects(createObjectIdentity(unpackObjectProfile(profile),profile),/Not enough distinctive/);
 // A rejected scan must not damage the original key/envelope.
 const good=objectFeatures(), recovery=await createObjectIdentity(good);
 await assert.rejects(verifyObjectRecovery(recovery,flat),/did not match/);
 await unlockObjectIdentity(recovery,recovery.keyEnvelope);
});

test('one repeated detail cannot satisfy many distinct cells', () => {
 const reference=objectFeatures(), repeated=objectFeatures();
 repeated.patches=repeated.patches.map((_,i)=>reference.patches[i<128?0:255]);
 const result=compareObjectDetails(packObjectProfile(reference),packObjectProfile(repeated));
 assert.equal(result.matched,false);
 assert.ok(result.coverage<0.7);
});
