import { validObjectProfile, unpackObjectProfile, validObjectProfileV2, type ObjectProfile, type ObjectProfileV2 } from '@tijori/core/object-profile';
import { compareDinoFeatures, validDinoFeatures, type DinoFeatures } from '@tijori/core/dino';
import { LEGACY_OBJECT_RECOVERY_KIND, LEGACY_OBJECT_WRAP_DOMAIN } from '@tijori/core/legacy';
import { generateIdentity, unlockIdentity, unlockIdentityAccount, validKeyEnvelope, type KeyEnvelope } from '@tijori/core/identity-key';

export const DINO_OBJECT_NAME = 'dino-object-demo-v1';
export type ObjectRecovery = { version: 1; kind: typeof LEGACY_OBJECT_RECOVERY_KIND; address: string; keyEnvelope: KeyEnvelope; features: DinoFeatures; objectProfile?: ObjectProfile };

// This is intentionally NOT secure encryption: the recovery file contains all
// material needed to derive this wrapping password. The photo is only a UI gate.
async function wrappingPassword(features: DinoFeatures, profile?: ObjectProfile) {
 const canonical = profile ? [profile.version,profile.encoding,profile.model,profile.revision,profile.data] : [features.version, features.model, features.revision, features.cls, features.patches];
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(LEGACY_OBJECT_WRAP_DOMAIN + JSON.stringify(canonical)));
 return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function createObjectIdentity(features: DinoFeatures, objectProfile?: ObjectProfile): Promise<ObjectRecovery> {
 if (!validDinoFeatures(features)) throw Error('Extract your object features first.');
 const identity = await generateIdentity(await wrappingPassword(features,objectProfile));
 return { version: 1, kind: LEGACY_OBJECT_RECOVERY_KIND, ...identity, features, ...(objectProfile?{objectProfile}:{}) };
}
export function parseObjectRecovery(text: string): ObjectRecovery {
 if (text.length > 3_000_000) throw Error('Recovery file is too large.');
 let value: ObjectRecovery;
 try { value = JSON.parse(text); } catch { throw Error('Invalid JSON recovery file.'); }
 if (!value || value.version !== 1 || value.kind !== LEGACY_OBJECT_RECOVERY_KIND || typeof value.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(value.address) || !validKeyEnvelope(value.keyEnvelope) || !validDinoFeatures(value.features) || (value.objectProfile!==undefined&&!validObjectProfile(value.objectProfile))) throw Error('Invalid or incompatible object recovery file.');
 return { version: 1, kind: LEGACY_OBJECT_RECOVERY_KIND, address: value.address,
  keyEnvelope: { version: 1, salt: value.keyEnvelope.salt, iv: value.keyEnvelope.iv, ciphertext: value.keyEnvelope.ciphertext },
  ...(value.objectProfile?{objectProfile:value.objectProfile}:{}),
  features: value.objectProfile?unpackObjectProfile(value.objectProfile):{ version: 1, model: value.features.model, revision: value.features.revision, cls: value.features.cls, patches: value.features.patches } };
}
export async function verifyObjectRecovery(recovery: ObjectRecovery, photo: DinoFeatures) {
 const result = compareDinoFeatures(recovery.features, photo);
 if (!result.matched) throw Error(`Object did not match (score ${result.score.toFixed(3)}). Try the same object with similar framing and lighting.`);
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
export function downloadObjectRecovery(recovery: ObjectRecovery | ObjectRecoveryV2) {
 const url = URL.createObjectURL(new Blob([JSON.stringify(recovery)], { type: 'application/json' }));
 const link = document.createElement('a'); link.href = url; link.download = `tijori-object-demo-${recovery.address}.json`;
 link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- Scanner v2 identities ----------
// The key is still wrapped with a password derived from the object profile (insecure demo by design), but the
// profile now stays on the server and is released only after a successful server-side object match at login.
export type ObjectRecoveryV2 = { version: 2; kind: typeof LEGACY_OBJECT_RECOVERY_KIND; address: string; keyEnvelope: KeyEnvelope; objectProfile: ObjectProfileV2 };
async function wrappingPasswordV2(profile: ObjectProfileV2) {
 const canonical = [profile.version, profile.encoding, profile.model, profile.revision, profile.views];
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(LEGACY_OBJECT_WRAP_DOMAIN + JSON.stringify(canonical)));
 return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
/** Create a new random identity for a scanner v2 profile. Save it on the device before signing up (retry-safe). */
export async function createObjectIdentityV2(objectProfile: ObjectProfileV2): Promise<ObjectRecoveryV2> {
 if (!validObjectProfileV2(objectProfile)) throw Error('Scan your object first.');
 const identity = await generateIdentity(await wrappingPasswordV2(objectProfile));
 return { version: 2, kind: LEGACY_OBJECT_RECOVERY_KIND, ...identity, objectProfile };
}
/** Unlock the in-memory signer with the profile the server released after a successful object match. */
export async function unlockObjectIdentityV2(address: string, envelope: KeyEnvelope, objectProfile: ObjectProfileV2) {
 if (!validKeyEnvelope(envelope) || !validObjectProfileV2(objectProfile)) throw Error('The server did not return a valid identity.');
 return unlockIdentityAccount(address, envelope, await wrappingPasswordV2(objectProfile));
}
export function parseObjectRecoveryV2(value: unknown): ObjectRecoveryV2 {
 const v = value as ObjectRecoveryV2;
 if (!v || v.version !== 2 || v.kind !== LEGACY_OBJECT_RECOVERY_KIND || typeof v.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(v.address) || !validKeyEnvelope(v.keyEnvelope) || !validObjectProfileV2(v.objectProfile)) throw Error('Invalid or incompatible object identity record.');
 return { version: 2, kind: LEGACY_OBJECT_RECOVERY_KIND, address: v.address, keyEnvelope: { version: 1, salt: v.keyEnvelope.salt, iv: v.keyEnvelope.iv, ciphertext: v.keyEnvelope.ciphertext }, objectProfile: v.objectProfile };
}
