import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export type KeyEnvelope = { version: 1; salt: string; iv: string; ciphertext: string };
const iterations = 600_000;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => new Uint8Array(value.match(/../g)!.map(x => parseInt(x, 16)));
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
 const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
 return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function generateIdentity(passphrase: string) {
 if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
 const privateKey = generatePrivateKey();
 const address = privateKeyToAccount(privateKey).address.toLowerCase();
 const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
 const key = await derive(passphrase, salt);
 const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('tichori-identity-v1:' + address) }, key, bytes(privateKey.slice(2)));
 return { address, keyEnvelope: { version: 1 as const, salt: hex(salt), iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) } };
}
async function decryptIdentity(address: string, envelope: KeyEnvelope, passphrase: string) {
 try {
  const key = await derive(passphrase, bytes(envelope.salt));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: new TextEncoder().encode('tichori-identity-v1:' + address.toLowerCase()) }, key, bytes(envelope.ciphertext));
  const raw = new Uint8Array(plaintext);
  const privateKey = ('0x' + hex(raw)) as `0x${string}`;
  raw.fill(0);
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== address.toLowerCase()) throw Error();
  return account;
 } catch { throw new Error('Could not unlock the identity. Check your address and passphrase.'); }
}
export async function unlockIdentity(address: string, envelope: KeyEnvelope, passphrase: string) {
 await decryptIdentity(address, envelope, passphrase);
}
/**
 * Unlock the identity as a signer for EIP-712 approvals (Safe transactions).
 * Keep the returned account in memory only. Never persist it, log it or send it to the server.
 */
export async function unlockIdentityAccount(address: string, envelope: KeyEnvelope, passphrase: string) {
 return decryptIdentity(address, envelope, passphrase);
}
export function validKeyEnvelope(value: unknown): value is KeyEnvelope {
 if (!value || typeof value !== 'object') return false;
 const e = value as Record<string, unknown>;
 return Object.keys(e).sort().join(',') === 'ciphertext,iv,salt,version' && e.version === 1 && typeof e.salt === 'string' && /^[0-9a-f]{32}$/.test(e.salt) && typeof e.iv === 'string' && /^[0-9a-f]{24}$/.test(e.iv) && typeof e.ciphertext === 'string' && /^[0-9a-f]{96}$/.test(e.ciphertext);
}
