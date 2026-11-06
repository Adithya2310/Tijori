import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {validObjectProfile,type ObjectProfile} from '../object-profile.ts';
import {validateVault,type Vault} from '../vault.ts';
import {MAX_STATE_BYTES} from './codec.ts';

export function objectProfileHash(profile:ObjectProfile){return createHash('sha256').update(JSON.stringify(profile)).digest('hex');}
export function encryptObjectProfile(address:string,profile:ObjectProfile,key:Buffer,context:string):Buffer {
 if(!/^0x[0-9a-f]{40}$/.test(address)||!validObjectProfile(profile))throw Error('Invalid object record.');
 const plain=Buffer.from(JSON.stringify({version:1,address,profile}));
 if(plain.length>MAX_STATE_BYTES)throw Error('Object reference exceeds the 100,000-byte per-entity limit.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(context+':object-profile-v1:'+address));
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
}
export function decryptObjectProfile(envelope:Buffer,address:string,expectedHash:string,key:Buffer,context:string):ObjectProfile {
 if(envelope.length<28||envelope.length>MAX_STATE_BYTES+28)throw Error('Invalid encrypted object reference.');
 const cipher=createDecipheriv('aes-256-gcm',key,envelope.subarray(0,12));cipher.setAAD(Buffer.from(context+':object-profile-v1:'+address));cipher.setAuthTag(envelope.subarray(12,28));
 const value=JSON.parse(Buffer.concat([cipher.update(envelope.subarray(28)),cipher.final()]).toString('utf8'));
 if(!value||value.version!==1||value.address!==address||!validObjectProfile(value.profile)||objectProfileHash(value.profile)!==expectedHash)throw Error('Object reference binding or hash did not match.');
 return value.profile;
}
export function dehydrateObjectProfiles(vault:Vault):Vault {
 const copy=structuredClone(vault);
 for(const wallet of copy.wallets)if(wallet.objectProfileRef){
  if(wallet.objectProfile&&objectProfileHash(wallet.objectProfile)!==wallet.objectProfileRef.profileHash)throw Error('Object reference does not match its stored hash.');
  delete wallet.objectProfile;
 }
 return validateVault(copy);
}
export function projectedObjectStateBytes(vault:Vault):number {
 const copy=structuredClone(vault);
 for(const wallet of copy.wallets)if(wallet.objectProfile){wallet.objectProfileRef??={version:1,entityKey:('0x'+'0'.repeat(64)) as `0x${string}`,profileHash:objectProfileHash(wallet.objectProfile)};delete wallet.objectProfile;}
 return Buffer.byteLength(JSON.stringify(copy));
}
