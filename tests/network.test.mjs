import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAddresses } from '../lib/local-network.mjs';
const ipv4=(address,internal=false)=>({address,family:'IPv4',internal});
test('phone links prefer Wi-Fi, retain Ethernet alternatives, and exclude loopback/VPN/public IPs',()=>{
 assert.deepEqual(lanAddresses({
  en5:[ipv4('10.73.34.192')],utun4:[ipv4('10.1.1.1')],
  lo0:[ipv4('127.0.0.1',true)],en0:[ipv4('192.168.1.12'),{address:'fe80::1',family:'IPv6',internal:false}],
  en7:[ipv4('8.8.8.8'),ipv4('172.16.0.2'),ipv4('172.32.0.2'),ipv4('192.168.1.12')],
 }),[{name:'en0',address:'192.168.1.12'},{name:'en5',address:'10.73.34.192'},{name:'en7',address:'172.16.0.2'}]);
 assert.deepEqual(lanAddresses({}),[]);
});
