import test from 'node:test';
import assert from 'node:assert/strict';
import { featuresFromTokens, compareDinoFeatures, compareCompactDinoFeatures } from '../lib/dino.ts';
import { packObjectProfile, unpackObjectProfile } from '../lib/object-profile.ts';
import { createObjectIdentity, unlockObjectIdentity, verifyObjectRecovery } from '../lib/dino-wallet.ts';
import { applyAction, emptyVault, validateVault, publicState } from '../lib/vault.ts';
import { encryptState } from '../lib/arkiv/codec.ts';
import { objectFeatures } from './fixtures/object-features.ts';
test('compact references roundtrip with stable key wrapping and remain private in public state',async()=>{
 const original=objectFeatures();
 const profile=packObjectProfile(original),features=unpackObjectProfile(profile);
 assert.ok(JSON.stringify(profile).length<18000);
 assert.equal(compareDinoFeatures(features,original).matched,true);
 const recovery=await createObjectIdentity(features,profile);
 await unlockObjectIdentity({...recovery,features:unpackObjectProfile(JSON.parse(JSON.stringify(profile)))},recovery.keyEnvelope);
 const vault=emptyVault();applyAction(vault,'signup',{name:'Synthetic object',address:recovery.address,keyEnvelope:recovery.keyEnvelope,objectName:'dino-object-demo-v1',objectProfile:profile});
 assert.ok(!JSON.stringify(publicState(vault)).includes(profile.data));
 const old=structuredClone(vault);delete old.wallets[0].objectProfile;
 const upgraded=validateVault({...old,version:4});assert.equal(upgraded.version,8);assert.deepEqual(upgraded.wallets,old.wallets);
 assert.throws(()=>unpackObjectProfile({...profile,data:'A'.repeat(16896)}),/Invalid stored object profile/);
 for(let i=0;i<7;i++)vault.wallets.push({...vault.wallets[0],id:'large'+i,address:('0x'+(i+1).toString(16).padStart(40,'0'))});
 assert.throws(()=>encryptState(vault,Buffer.alloc(32,1),'test'),/limit/);
});

test('compact scorer preserves full expanded token scores without repeating dot products',()=>{
 const a=unpackObjectProfile(packObjectProfile(objectFeatures()));
 const changed=objectFeatures(),alternative=objectFeatures(64);changed.patches=changed.patches.map((v,i)=>i<40?alternative.patches[i]:v);
 const b=unpackObjectProfile(packObjectProfile(changed));
 const original=compareDinoFeatures(a,b),compact=compareCompactDinoFeatures(a,b);
 for(const field of ['global','patches','score','agreement'] as const)assert.ok(Math.abs(original[field]-compact[field])<1e-12);
 assert.equal(original.matched,compact.matched);
});

test('compares compact references and scans using the same pooling without rekeying', async () => {
 const data = new Float32Array(257 * 384); data[0] = 1;
 // Each 2x4 pool contains eight different patches. Comparing its pooled
 // descriptor directly to raw patches would unfairly fail even the original scan.
 for (let i = 0; i < 256; i++) {
  data[(i+1)*384 + 1 + (Math.floor(i/16)%2)*4 + i%4] = 1;
  data[(i+1)*384 + 16 + Math.floor(Math.floor(i/16)/2)*4 + Math.floor(i%16/4)] = 0.4;
 }
 const original = featuresFromTokens(data,[1,257,384]);
 const profile = packObjectProfile(original);
 const recovery = await createObjectIdentity(unpackObjectProfile(profile),profile);
 assert.equal(compareDinoFeatures(recovery.features,original).matched,false);
 assert.equal((await verifyObjectRecovery(recovery,original)).matched,true);
 const wrong = structuredClone(original);
 wrong.cls = Array(384).fill(0); wrong.cls[0]=0.6; wrong.cls[20]=0.8;
 wrong.patches = wrong.patches.map(() => [...wrong.cls]);
 await assert.rejects(verifyObjectRecovery(recovery,wrong),/did not match/);
 await unlockObjectIdentity(recovery,recovery.keyEnvelope);
});
