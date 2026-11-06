import { LEGACY_IDENTITY_DB } from '@tijori/core/legacy';
import { parseObjectRecovery, parseObjectRecoveryV2, type ObjectRecovery, type ObjectRecoveryV2 } from './dino-wallet.ts';
import { createTijoriClient, type TijoriClient } from './api.ts';

/** A sign-up remembered on this device (v2 records hold the scanner v2 profile; v1 records come from 0.1.x). */
export type DeviceIdentity = { version: 1; name: string; status: 'pending' | 'registered'; recovery: ObjectRecovery | ObjectRecoveryV2 };
export function validateDeviceIdentity(value: unknown): DeviceIdentity {
 if (!value || typeof value !== 'object') throw Error('Invalid saved identity.');
 const record = value as DeviceIdentity;
 if (record.version !== 1 || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 120 || !['pending', 'registered'].includes(record.status)) throw Error('Invalid saved identity.');
 const recovery = (record.recovery as { version?: unknown } | undefined)?.version === 2 ? parseObjectRecoveryV2(record.recovery) : parseObjectRecovery(JSON.stringify(record.recovery));
 return { version: 1, name: record.name, status: record.status, recovery };
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

/** Usernames of the object identities enrolled on the server (for suggestions). Profiles are never listed. */
export async function listObjectUsernames(client: Pick<TijoriClient, 'objectIdentities'> = createTijoriClient()): Promise<{ name: string; address: string | null }[]> {
 return (await client.objectIdentities()).identities;
}
