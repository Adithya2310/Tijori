import { networkInterfaces } from 'node:os';

// Skip loopback, public addresses and VPN interfaces. Keep Wi-Fi and Ethernet
// alternatives: a multi-interface laptop cannot know which network the phone uses.
export function lanAddresses(interfaces = networkInterfaces()) {
 const addresses = [];
 for (const [name, entries] of Object.entries(interfaces)) {
  if (/^(utun|tun|tap|docker|veth|bridge)/i.test(name)) continue;
  for (const entry of entries || []) {
   if (entry.internal || entry.family !== 'IPv4') continue;
   const ip = entry.address;
   const parts = ip.split('.').map(Number);
   const privateIp = parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
   if (privateIp && !addresses.some(item => item.address === ip)) addresses.push({name,address:ip});
  }
 }
 return addresses.sort((a,b) => Number(b.name === 'en0') - Number(a.name === 'en0'));
}
