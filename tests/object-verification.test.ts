import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFeatures } from './fixtures/object-scan.ts';
import { packMultiObjectProfile, unpackObjectProfile, validObjectProfile } from '../lib/object-profile.ts';
import { compareObjectScan } from '../lib/object-verification.ts';
import { categoryFromPredictions, scanQualityReason, selectObjectCandidate } from '../lib/object-scan.ts';
import { createObjectIdentity, verifyObjectRecovery, unlockObjectIdentity } from '../lib/dino-wallet.ts';
import { findUsername } from '../lib/object-username.ts';
import { emptyVault, applyAction, validateVault } from '../lib/vault.ts';

const views=()=>[scanFeatures(1),scanFeatures(2,'bottle',64),scanFeatures(3,'bottle',128),scanFeatures(4,'bottle',192)];

test('a fresh overlapping enrolled view passes all gates without averaging other viewpoints',()=>{
 const profile=packMultiObjectProfile(views(),'object-demo-v1');
 const result=compareObjectScan(unpackObjectProfile(profile),scanFeatures(10,'bottle',128),profile);
 assert.equal(result.decision,'MATCH');assert.equal(result.view,2);
 assert.equal(result.views.length,4);assert.equal(result.calibrated,false);
 assert.equal(result.detail.geometryPass,true);
});

test('same username with pen/watch/person or another instance never gains access to its bottle reference',async()=>{
 const profile=packMultiObjectProfile(views(),'object-demo-v1');
 const recovery=await createObjectIdentity(unpackObjectProfile(profile),profile);
 const user=findUsername([{name:'Demo.User',recovery}],' demo.user ');
 for(const category of ['pen','watch','person'] as const) {
  const result=compareObjectScan(user.recovery.features,scanFeatures(10,category),profile);
  assert.equal(result.decision,'REJECT',category);assert.equal(result.matched,false);
  await assert.rejects(verifyObjectRecovery(user.recovery,scanFeatures(10,category)),/did not match/);
 }
 const lookalike=scanFeatures(11,'bottle',256);
 await assert.rejects(verifyObjectRecovery(user.recovery,lookalike),/did not match/);
 await unlockObjectIdentity(recovery,recovery.keyEnvelope);
});

test('missing quality, blank/unknown target, poor scan and replayed enrollment request retry, never match',()=>{
 const profile=packMultiObjectProfile(views(),'object-demo-v1'),reference=unpackObjectProfile(profile);
 const missing=scanFeatures(10);delete (missing as {scan?:unknown}).scan;
 assert.equal(compareObjectScan(reference,missing,profile).reason,'missing_scan_evidence');
 for(const mutate of [(q:ReturnType<typeof scanFeatures>)=>{q.scan.category.label='unknown';},(q:ReturnType<typeof scanFeatures>)=>{q.scan.quality.sharpness=0;},(q:ReturnType<typeof scanFeatures>)=>{q.scan.foreground.fill(0);},(q:ReturnType<typeof scanFeatures>)=>{q.scan.quality.maskConfidence=0;},(q:ReturnType<typeof scanFeatures>)=>{q.scan.category.ambiguous=true;}]) {
  const q=scanFeatures(10);mutate(q);const result=compareObjectScan(reference,q,profile);
  assert.equal(result.decision,'RETRY');assert.equal(result.matched,false);
 }
 const replay=compareObjectScan(reference,views()[0],profile);
 assert.equal(replay.matched,false); // no other distinct view matches this descriptor
 assert.equal(replay.views[0].reason,'fresh_capture_required');
});

test('local matches need coherent geometry, not a bag of rearranged details',()=>{
 const profile=packMultiObjectProfile([1,2,3,4].map(id=>scanFeatures(id)),'object-demo-v1');
 const query=scanFeatures(10),original=query.patches;
 query.patches=original.map((_,i)=>{
  const y=Math.floor(i/16),x=i%16,cell=Math.floor(x/4);
  return original[y*16+(cell%2===0?cell+1:cell-1)*4+x%4];
 });
 const result=compareObjectScan(unpackObjectProfile(profile),query,profile);
 assert.equal(result.decision,'RETRY');assert.equal(result.reason,'no_geometric_overlap');
});

test('coherent matching does not reject repeated local texture because of an arbitrary assignment',()=>{
 function repeated(id:number) {
  const feature=scanFeatures(id),original=feature.patches;
  feature.patches=original.map((_,i)=>original[Math.floor(Math.floor(i/16)/2)*32]);
  return feature;
 }
 const profile=packMultiObjectProfile([1,2,3,4].map(repeated),'object-demo-v1');
 const result=compareObjectScan(unpackObjectProfile(profile),repeated(10),profile);
 assert.equal(result.decision,'MATCH');assert.equal(result.detail.inlierRatio,1);assert.equal(result.detail.inliers,32);
});

test('strict schema keeps four distinct versioned views and refuses mixed, empty or unknown evidence',()=>{
 const profile=packMultiObjectProfile(views(),'object-demo-v1');
 assert.equal(validObjectProfile(JSON.parse(JSON.stringify(profile))),true);
 assert.throws(()=>packMultiObjectProfile(views().slice(0,3),'object-demo-v1'),/four/);
 assert.throws(()=>packMultiObjectProfile([views()[0],views()[0],views()[0],views()[0]],'object-demo-v1'),/distinct/);
 const mixed=views();mixed[3].scan.category.label='pen';assert.throws(()=>packMultiObjectProfile(mixed,'object-demo-v1'));
 const bad=structuredClone(profile);bad.views[0].scan.preprocess='unknown' as typeof bad.scan.preprocess;assert.equal(validObjectProfile(bad),false);
 const invalid=scanFeatures(20);invalid.scan.quality.maskFraction=NaN;assert.equal(scanQualityReason(invalid.scan),'invalid_scan');
});

test('username lookup is exact and unambiguous; registration and login bind it to one stored identity',()=>{
 const profile=packMultiObjectProfile(views(),'object-demo-v1');
 const keyEnvelope={version:1 as const,salt:'aa'.repeat(16),iv:'bb'.repeat(12),ciphertext:'cc'.repeat(48)};
 const vault=emptyVault(),address='0x'+'11'.repeat(20);
 const body={name:'Demo.User',objectName:'dino-object-demo-v1',address,keyEnvelope,objectProfile:profile};
 const id=applyAction(vault,'signup',body);
 assert.equal(findUsername(vault.wallets,' demo.user ').id,id);
 assert.throws(()=>findUsername(vault.wallets,'Demo'),/No object identity/);
 assert.throws(()=>findUsername([...vault.wallets,...vault.wallets],'demo.user'),/ambiguous/);
 assert.throws(()=>applyAction(vault,'signup',{...body,address:'0x'+'22'.repeat(20),name:'demo.USER'}),/already in use/);
 assert.throws(()=>applyAction(vault,'login',{address,objectName:body.objectName,username:'other'}),/Username/);
 assert.throws(()=>applyAction(vault,'login',{address,objectName:body.objectName}),/Username/);
 assert.equal(applyAction(vault,'login',{address,objectName:body.objectName,username:'demo.user'}),id);
 const legacy=structuredClone(vault);const upgraded=validateVault({...legacy,version:6});
 assert.equal(upgraded.version,8);assert.deepEqual(upgraded.wallets,legacy.wallets);
});

test('category gate does not turn unknown or conflicting classifier predictions into an identity',()=>{
 assert.equal(categoryFromPredictions([{label:'water bottle',score:0.9},{label:'ballpoint',score:0.01}]).ambiguous,true);
 assert.equal(categoryFromPredictions([{label:'water bottle',score:0.9},{label:'wine bottle',score:0.08}]).label,'bottle');
 assert.equal(categoryFromPredictions([{label:'desk',score:0.9}]).label,'unknown');
 assert.throws(()=>categoryFromPredictions([{label:'water bottle',score:NaN}]),/Invalid/);
});

test('candidate selection finds a valid whole object without weakening quality or accepting conflicting categories',()=>{
 const part=scanFeatures(1).scan,whole=scanFeatures(2).scan;
 part.category.ambiguous=true;part.category.confidence=0.2;
 assert.equal(selectObjectCandidate([part,whole]).index,1);
 const badQuality=scanFeatures(3).scan;badQuality.quality.maskConfidence=0.2;badQuality.category.confidence=1;
 assert.equal(selectObjectCandidate([badQuality,whole]).index,1);
 const other=scanFeatures(4,'watch').scan;
 assert.equal(selectObjectCandidate([whole,other]).scan.category.ambiguous,true);
 assert.equal(scanQualityReason(selectObjectCandidate([whole,other]).scan),'unknown_or_ambiguous_category');
});
