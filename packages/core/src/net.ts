// Pure (isomorphic) checks for non-public network destinations, used for webhook SSRF protection.
// Covers loopback, private, link-local, CGNAT, documentation, multicast/reserved, ULA and IPv4-mapped IPv6.

const V4_BLOCKED: [number, number][] = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]
 .map(([net, bits]) => [ipv4ToInt(net as string)!, bits as number]);

function ipv4ToInt(ip: string): number | null {
 const parts = ip.split('.');
 if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
 return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}
function ipv6ToHextets(ip: string): number[] | null {
 let text = ip.toLowerCase();
 const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
 if (v4) { const n = ipv4ToInt(v4[1]); if (n === null) return null; text = text.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
 const halves = text.split('::');
 if (halves.length > 2) return null;
 const parse = (s: string) => (s ? s.split(':') : []).map(h => (/^[\da-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
 const head = parse(halves[0]), tail = halves.length === 2 ? parse(halves[1]) : [];
 if ([...head, ...tail].some(Number.isNaN)) return null;
 const missing = 8 - head.length - tail.length;
 if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
 return [...head, ...Array(halves.length === 2 ? missing : 0).fill(0), ...tail];
}
const isIPv4 = (s: string) => ipv4ToInt(s) !== null;
const isIPv6 = (s: string) => s.includes(':') && ipv6ToHextets(s) !== null;

/** True for any address that is not a public unicast address (unknown formats count as non-public). */
export function isNonPublicAddress(address: string): boolean {
 const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
 const n = ipv4ToInt(ip);
 if (n !== null) return V4_BLOCKED.some(([net, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(net / 2 ** (32 - bits)));
 const h = ipv6ToHextets(ip);
 if (!h) return true;
 if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) return isNonPublicAddress(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
 if (h.slice(0, 7).every(x => x === 0) && (h[7] === 0 || h[7] === 1)) return true; // :: and ::1
 if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
 if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
 if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
 if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return true; // 64:ff9b::/96 NAT64
 if (h[0] === 0x100 && h.slice(1, 4).every(x => x === 0)) return true; // 100::/64 discard
 if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // documentation
 return false;
}
/** Synchronous check for URL hostnames that are IP literals or obviously local names. */
export function isNonPublicHostname(hostname: string): boolean {
 const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
 if (isIPv4(host) || isIPv6(host)) return isNonPublicAddress(host);
 return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.');
}
