import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { validateVault, type Vault } from '../vault.ts';
export const MAX_STATE_BYTES = 100_000;
export function encryptState(vault: Vault, key: Buffer, context: string): Buffer {
 const plain = Buffer.from(JSON.stringify(validateVault(vault)));
 if (plain.length > MAX_STATE_BYTES) throw new Error('Demo storage limit reached. Export and redesign storage before adding data.');
 const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
 cipher.setAAD(Buffer.from(context));
 const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
 return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
export function decryptState(envelope: Buffer, key: Buffer, context: string): Vault {
 try {
  if (envelope.length < 28 || envelope.length > MAX_STATE_BYTES + 28) throw Error();
  const cipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(0, 12));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(envelope.subarray(12, 28));
  return validateVault(JSON.parse(Buffer.concat([cipher.update(envelope.subarray(28)), cipher.final()]).toString('utf8')));
 } catch { throw new Error('Cannot decrypt or validate Arkiv state. Check the encryption key and namespace.'); }
}
