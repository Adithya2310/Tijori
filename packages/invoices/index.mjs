// @tichori/invoices: zero-dependency vendor SDK for the Tichori treasury invoice inbox.
// Works in Node 20+ (fetch + node:crypto). Keep the inbox key and webhook secret on your server.
import { createHmac, timingSafeEqual } from 'node:crypto';

export class TichoriError extends Error {
 constructor(message, status) { super(message); this.name = 'TichoriError'; this.status = status; }
}

/**
 * @param {{ baseUrl: string, inboxKey: string, fetch?: typeof fetch }} options
 */
export function createInvoiceClient({ baseUrl, inboxKey, fetch: fetcher = fetch }) {
 if (!baseUrl || !inboxKey) throw new TichoriError('baseUrl and inboxKey are required.');
 const root = baseUrl.replace(/\/$/, '') + '/api/v1';
 async function request(method, path, body) {
  const response = await fetcher(root + path, { method, headers: { Authorization: `Bearer ${inboxKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new TichoriError(data.error || `Tichori request failed (${response.status}).`, response.status);
  return data;
 }
 return {
  /** Bill the treasury. Reusing `externalId` returns the existing invoice instead of a duplicate. */
  async create(input) {
   const { invoice, receiptPath } = await request('POST', '/invoices', input);
   return { ...invoice, receiptUrl: baseUrl.replace(/\/$/, '') + receiptPath };
  },
  async retrieve(id) {
   const { invoice, receiptPath } = await request('GET', `/invoices?id=${encodeURIComponent(id)}`);
   return { ...invoice, receiptUrl: baseUrl.replace(/\/$/, '') + receiptPath };
  },
  /** Nudge the treasury signers (at most once per hour per invoice). */
  async remind(id) { return (await request('POST', '/invoices/remind', { id })).invoice; },
 };
}

/**
 * Verify a `Tichori-Signature: t=<unix>,v1=<hex>` webhook header against the raw request body.
 * @returns {boolean}
 */
export function verifyWebhook(rawBody, header, secret, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000)) {
 const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')));
 const timestamp = Number(parts.t);
 if (!Number.isInteger(timestamp) || !/^[\da-f]{64}$/.test(parts.v1 || '') || Math.abs(now - timestamp) > toleranceSeconds) return false;
 const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
 return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}
