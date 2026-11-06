// Webhook destination checks (SSRF): the pure address rules live in @tijori/core; this adds DNS resolution.
import { lookup } from 'node:dns/promises';
import { isNonPublicAddress, isNonPublicHostname } from '@tijori/core/net';

export { isNonPublicAddress, isNonPublicHostname };
/** Resolve at delivery time; every resolved address must be public. */
export async function resolvesToPublicAddresses(hostname: string): Promise<boolean> {
 if (isNonPublicHostname(hostname)) return false;
 try { const addresses = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true }); return addresses.length > 0 && addresses.every(a => !isNonPublicAddress(a.address)); }
 catch { return false; }
}
