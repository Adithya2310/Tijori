import test from 'node:test';
import assert from 'node:assert/strict';
import { featuresFromTokens, compareDinoFeatures } from '@tijori/core/dino';
import { packObjectProfile, unpackObjectProfile } from '@tijori/core/object-profile';
import { createObjectIdentity, unlockObjectIdentity } from '@tijori/client/dino-wallet';
import { applyAction, emptyVault, validateVault, publicState } from '@tijori/core/vault';
import { encryptState } from '@tijori/server/storage/codec';
test('scanner v1 references still load and unlock, but new v1 sign-ups are refused',async()=>{
 const data=new Float32Array(257*384);for(let i=0;i<257;i++)data[i*384]=1;
 const original=featuresFromTokens(data,[1,257,384]);
 const profile=packObjectProfile(original),features=unpackObjectProfile(profile);
 assert.ok(JSON.stringify(profile).length<18000);
 assert.equal(compareDinoFeatures(features,original).matched,true);
 const recovery=await createObjectIdentity(features,profile);
 await unlockObjectIdentity({...recovery,features:unpackObjectProfile(JSON.parse(JSON.stringify(profile)))},recovery.keyEnvelope);
 const vault=emptyVault();
 assert.throws(()=>applyAction(vault,'signup',{name:'Synthetic object',address:recovery.address,keyEnvelope:recovery.keyEnvelope,objectName:'dino-object-demo-v1',objectProfile:profile}),/older Tijori version/);
 // Records enrolled by 0.1.x keep validating (they are told to enroll again at login).
 vault.wallets.push({id:'v1-wallet',name:'Synthetic object',address:recovery.address,keyEnvelope:recovery.keyEnvelope,objectProfile:profile,object_name:'dino-object-demo-v1',created_at:new Date().toISOString()});
 assert.equal(validateVault(structuredClone(vault)).wallets[0].objectProfile?.version,1);
 assert.ok(!JSON.stringify(publicState(vault)).includes(profile.data));
 const old=structuredClone(vault);delete old.wallets[0].objectProfile;
 const upgraded=validateVault({...old,version:4});assert.equal(upgraded.version,7);assert.deepEqual(upgraded.wallets,old.wallets);
 assert.throws(()=>unpackObjectProfile({...profile,data:'A'.repeat(16896)}),/empty/);
 for(let i=0;i<7;i++)vault.wallets.push({...vault.wallets[0],id:'large'+i,address:('0x'+(i+1).toString(16).padStart(40,'0'))});
 assert.throws(()=>encryptState(vault,Buffer.alloc(32,1),'test'),/limit/);
});
