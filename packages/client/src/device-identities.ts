import { LEGACY_IDENTITY_DB, LEGACY_OBJECT_RECOVERY_KIND } from '@tijori/core/legacy';
import { unpackObjectProfile } from '@tijori/core/object-profile';
import { parseObjectRecovery, type ObjectRecovery } from './dino-wallet.ts';
import { createTijoriClient, type TijoriClient } from './api.ts';

export type DeviceIdentity = { version: 1; name: string; status: 'pending' | 'registered'; recovery: ObjectRecovery };
export function validateDeviceIdentity(value: unknown): DeviceIdentity {
 if (!value || typeof value !== 'object') throw Error('Invalid saved identity.');
 const record = value as DeviceIdentity;
 if (record.version !== 1 || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 120 || !['pending', 'registered'].includes(record.status)) throw Error('Invalid saved identity.');
 return { version: 1, name: record.name, status: record.status, recovery: parseObjectRecovery(JSON.stringify(record.recovery)) };
}
// Stores the same explicitly insecure demo vault as the optional recovery file.
// No original photos, plaintext private keys or user passphrases are persisted.
function database(): Promise<IDBDatabase> {
 return new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(Error('Browser storage is unavailable. Enable site storage to remember this identity.')); return; }
  const request = indexedDB.open(LEGACY_IDENTITY_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('identities', { keyPath: 'recovery.address' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(Error('Could not open saved identities. Check browser storage permissions.'));
  request.onblocked = () => reject(Error('Close other tabs of this app before updating saved identities.'));
 });
}
export async function listDeviceIdentities(): Promise<DeviceIdentity[]> {
 const db = await database();
 return new Promise((resolve, reject) => {
  const transaction = db.transaction('identities', 'readonly');
  const request = transaction.objectStore('identities').getAll();
  transaction.oncomplete = () => { db.close(); try { resolve(request.result.map(validateDeviceIdentity)); } catch { reject(Error('A saved identity is corrupt. Restore its original backup; it will not be replaced automatically.')); } };
  transaction.onabort = transaction.onerror = () => { db.close(); reject(Error('Could not read saved identities.')); };
 });
}
export async function saveDeviceIdentity(identity: DeviceIdentity): Promise<void> {
 const record = validateDeviceIdentity(identity);
 const db = await database();
 return new Promise((resolve, reject) => {
  const transaction = db.transaction('identities', 'readwrite');
  transaction.objectStore('identities').put(record);
  transaction.oncomplete = () => { db.close(); resolve(); };
  transaction.onabort = transaction.onerror = () => { db.close(); reject(Error('Could not save the identity on this browser. Free storage and retry; no new user was submitted.')); };
 });
}

/** Identities enrolled on the server (compact object profiles and encrypted key envelopes), for sign-in on a new device. */
export async function listServerIdentities(client: Pick<TijoriClient, 'objectIdentities'> = createTijoriClient()): Promise<DeviceIdentity[]> {
 const { identities } = await client.objectIdentities();
 return identities.map(record => validateDeviceIdentity({ version: 1, name: record.name, status: 'registered', recovery: { version: 1, kind: LEGACY_OBJECT_RECOVERY_KIND, address: record.address, keyEnvelope: record.keyEnvelope, objectProfile: record.objectProfile, features: unpackObjectProfile(record.objectProfile) } }));
}
