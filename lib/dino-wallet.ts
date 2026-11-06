import { packObjectProfile, validObjectProfile, unpackObjectProfile, objectProfileViews, type ObjectProfile } from './object-profile.ts';
import { validDinoFeatures, type DinoFeatures } from './dino.ts';
import { compareObjectDetails } from './object-detail.ts';
import { compareObjectScan } from './object-verification.ts';
import { generateIdentity, unlockIdentity, unlockIdentityAccount, validKeyEnvelope, type KeyEnvelope } from './identity-key.ts';

export const DINO_OBJECT_NAME = 'dino-object-demo-v1';
export type ObjectRecovery = { version: 1; kind: 'tichori-insecure-object-demo'; address: string; keyEnvelope: KeyEnvelope; features: DinoFeatures; objectProfile?: ObjectProfile };

// This is intentionally NOT secure encryption: the recovery file contains all
// material needed to derive this wrapping password. The photo is only a UI gate.
async function wrappingPassword(features: DinoFeatures, profile?: ObjectProfile) {
 const canonical = profile?.version===2 ? [profile.version,profile.encoding,profile.model,profile.revision,profile.data,profile.scan,profile.views,profile.protection] : profile ? [profile.version,profile.encoding,profile.model,profile.revision,profile.data] : [features.version, features.model, features.revision, features.cls, features.patches];
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tichori-insecure-object-demo-v1:' + JSON.stringify(canonical)));
 return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function createObjectIdentity(features: DinoFeatures, objectProfile?: ObjectProfile): Promise<ObjectRecovery> {
 if (!validDinoFeatures(features)) throw Error('Extract your object features first.');
 const profile = objectProfile ?? packObjectProfile(features);
 if (!objectProfileViews(profile).every(view=>compareObjectDetails(view.profile,view.profile,view.scan,view.scan).matched)) throw Error('Not enough distinctive object detail. Choose a textured object, move closer and retake in good light.');
 const identity = await generateIdentity(await wrappingPassword(features,objectProfile));
 return { version: 1, kind: 'tichori-insecure-object-demo', ...identity, features, ...(objectProfile?{objectProfile}:{}) };
}
export function parseObjectRecovery(text: string): ObjectRecovery {
 if (text.length > 3_000_000) throw Error('Recovery file is too large.');
 let value: ObjectRecovery;
 try { value = JSON.parse(text); } catch { throw Error('Invalid JSON recovery file.'); }
 if (!value || value.version !== 1 || value.kind !== 'tichori-insecure-object-demo' || typeof value.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(value.address) || !validKeyEnvelope(value.keyEnvelope) || !validDinoFeatures(value.features) || (value.objectProfile!==undefined&&!validObjectProfile(value.objectProfile))) throw Error('Invalid or incompatible object recovery file.');
 return { version: 1, kind: 'tichori-insecure-object-demo', address: value.address,
  keyEnvelope: { version: 1, salt: value.keyEnvelope.salt, iv: value.keyEnvelope.iv, ciphertext: value.keyEnvelope.ciphertext },
  ...(value.objectProfile?{objectProfile:value.objectProfile}:{}),
  features: value.objectProfile?unpackObjectProfile(value.objectProfile):{ version: 1, model: value.features.model, revision: value.features.revision, cls: value.features.cls, patches: value.features.patches } };
}
export async function verifyObjectRecovery(recovery: ObjectRecovery, photo: DinoFeatures) {
 // Compare like representations. Never alter the original template used to
 // wrap an existing key: that would make previously created identities unreadable.
 const result = compareObjectScan(recovery.features, photo, recovery.objectProfile);
 const { detail } = result;
 if(result.decision==='RETRY')throw Error(`Object did not match yet: ${result.reason.replaceAll('_',' ')}. Retake the photo in good light from an enrolled angle.`);
 if(result.reason==='different_category')throw Error('Object did not match: this is a different object category. Show the object registered to this username.');
 if (!detail.sufficientDetail) throw Error('Object did not match: not enough distinctive detail in the reference or scan. Retake in good light. An older low-detail reference may need a new demo identity; its existing key and backup remain unchanged.');
 if (!detail.matched) throw Error('Object did not match: its local details or their positions differ. Show the original object in the same orientation and tap the same part.');
 if (!result.matched) throw Error('Object did not match strongly enough. Show the original object with similar framing and lighting, then tap the same part of it.');
 await unlockObjectIdentity(recovery, recovery.keyEnvelope);
 return result;
}
export async function unlockObjectIdentity(recovery: ObjectRecovery, envelope: KeyEnvelope) {
 if (!validKeyEnvelope(envelope) || (['version', 'salt', 'iv', 'ciphertext'] as const).some(key => envelope[key] !== recovery.keyEnvelope[key])) throw Error('The recovery file does not match this stored identity.');
 await unlockIdentity(recovery.address, envelope, await wrappingPassword(recovery.features,recovery.objectProfile));
}
/** Unlock the object identity as an in-memory signer for Whitechain vault approvals. Never persist it. */
export async function unlockObjectIdentityAccount(recovery: ObjectRecovery, envelope: KeyEnvelope) {
 if (!validKeyEnvelope(envelope) || (['version', 'salt', 'iv', 'ciphertext'] as const).some(key => envelope[key] !== recovery.keyEnvelope[key])) throw Error('The recovery file does not match this stored identity.');
 return unlockIdentityAccount(recovery.address, envelope, await wrappingPassword(recovery.features, recovery.objectProfile));
}
export function downloadObjectRecovery(recovery: ObjectRecovery) {
 const url = URL.createObjectURL(new Blob([JSON.stringify(recovery)], { type: 'application/json' }));
 const link = document.createElement('a'); link.href = url; link.download = `tichori-object-demo-${recovery.address}.json`;
 link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
