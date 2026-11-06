// Derived vendor-inbox credentials. Nothing secret is stored: keys are HMACs of the vault ID under a
// server master key, so they can be re-issued and verified without a database row.
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { LEGACY_API_KEYS_INFO } from '@tijori/core/legacy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deriveMasterKey(secretHex: string) {
 if (!/^[\da-f]{64}$/i.test(secretHex)) throw new Error('Master key must be 32 bytes of hex.');
 return Buffer.from(hkdfSync('sha256', Buffer.from(secretHex, 'hex'), Buffer.alloc(0), LEGACY_API_KEYS_INFO, 32));
}
const mac = (master: Buffer, purpose: string, vaultId: string) => createHmac('sha256', master).update(`${purpose}:${vaultId}`).digest('base64url');
export const inboxKeyFor = (master: Buffer, vaultId: string) => `tinbox_${vaultId}_${mac(master, 'inbox', vaultId).slice(0, 32)}`;
export const webhookSecretFor = (master: Buffer, vaultId: string) => `whsec_${mac(master, 'webhook', vaultId).slice(0, 43)}`;
/** Returns the vault ID for a valid inbox key, otherwise null. Constant-time comparison. */
export function verifyInboxKey(master: Buffer, presented: string | null | undefined): string | null {
 const match = /^tinbox_([0-9a-f-]{36})_([\w-]{32})$/.exec(presented ?? '');
 if (!match || !UUID.test(match[1])) return null;
 const expected = Buffer.from(inboxKeyFor(master, match[1])), actual = Buffer.from(presented!);
 return expected.length === actual.length && timingSafeEqual(expected, actual) ? match[1] : null;
}
/** Stripe-style signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
 return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}
