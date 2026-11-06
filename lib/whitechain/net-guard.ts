// Webhook destination checks (SSRF): reject non-public IP ranges, including IPv6 and IPv4-mapped forms.
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const blocked = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32]] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for any address that is not a public unicast address. */
export function isNonPublicAddress(address: string): boolean {
 const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
 const family = isIP(ip);
 if (family === 4) return blocked.check(ip, 'ipv4');
 if (family !== 6) return true;
 const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip) ?? /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(ip);
 if (mapped) {
  const v4 = mapped.length === 2 ? mapped[1] : [parseInt(mapped[1], 16) >> 8, parseInt(mapped[1], 16) & 255, parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255].join('.');
  return blocked.check(v4, 'ipv4');
 }
 return blocked.check(ip, 'ipv6') || ip.startsWith('::ffff:');
}
/** Synchronous check for URL hostnames that are IP literals or obviously local names. */
export function isNonPublicHostname(hostname: string): boolean {
 const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
 if (isIP(host)) return isNonPublicAddress(host);
 return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.');
}
/** Resolve at delivery time; every resolved address must be public. */
export async function resolvesToPublicAddresses(hostname: string): Promise<boolean> {
 if (isNonPublicHostname(hostname)) return false;
 try { const addresses = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true }); return addresses.length > 0 && addresses.every(a => !isNonPublicAddress(a.address)); }
 catch { return false; }
}
