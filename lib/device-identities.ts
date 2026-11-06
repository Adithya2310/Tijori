import { parseObjectRecovery, type ObjectRecovery } from './dino-wallet.ts';

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
  const request = indexedDB.open('tichori-object-identities', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('identities', { keyPath: 'recovery.address' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(Error('Could not open saved identities. Check browser storage permissions.'));
  request.onblocked = () => reject(Error('Close other Tichori tabs before updating saved identities.'));
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

export async function listServerIdentities(): Promise<DeviceIdentity[]> {
 const response=await fetch('/api/object-identities',{cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Could not retrieve stored identities.');
 const {unpackObjectProfile}=await import('./object-profile.ts');
 return result.identities.map((record: {name:string;address:string;keyEnvelope:ObjectRecovery['keyEnvelope'];objectProfile:import('./object-profile.ts').ObjectProfile})=>validateDeviceIdentity({version:1,name:record.name,status:'registered',recovery:{version:1,kind:'tichori-insecure-object-demo',address:record.address,keyEnvelope:record.keyEnvelope,objectProfile:record.objectProfile,features:unpackObjectProfile(record.objectProfile)}}));
}
