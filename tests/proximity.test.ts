import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, emptyVault, publicState, validateVault } from '../lib/vault.ts';
import { applyProximity, sessionView, validateProximity } from '../lib/proximity.ts';
import { encryptState, decryptState } from '../lib/arkiv/codec.ts';
const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
function fixture() {
 const v = emptyVault();
 const ids = [1,2,3].map(n => applyAction(v, 'signup', {name:`P${n}`,address:address(n),objectName:'mug',keyEnvelope})!);
 applyAction(v, 'groups', {name:'Family',creatorId:ids[0],addresses:[address(2)]});
 return {v,ids,groupId:v.groups[0].id};
}
test('v3 upgrade preserves all records and adds empty proximity state; encrypted v4 roundtrip preserves sessions', () => {
 const {v,ids,groupId} = fixture();
 const old: Record<string, unknown> = structuredClone(v);
 delete old.proximitySessions;
 const upgraded = validateVault({...old,version:3});
 assert.deepEqual(upgraded,v);
 applyProximity(v,{action:'start',groupId,walletId:ids[0]},'enroll',1000);
 const encrypted = encryptState(v,Buffer.alloc(32,1),'fixture');
 assert.deepEqual(decryptState(encrypted,Buffer.alloc(32,1),'fixture'),v);
 assert.ok(!JSON.stringify(publicState(v)).includes(v.proximitySessions[0].nonce));
 assert.ok(!JSON.stringify(sessionView(v.proximitySessions[0])).includes('nonce'));
 assert.throws(()=>validateVault({...v,proximitySessions:undefined}), /proximity/);
});
test('expiry, stale replay, cancellation, duplicate matches and input corruption', () => {
 const {v,ids,groupId}=fixture();
 const call=(action:string,walletId=ids[0],extra:object={},now=1000)=>applyProximity(v,{action,groupId,walletId,...extra},`op-${now}`,now);
 const start=call('start'), s=v.proximitySessions[0];
 assert.equal(start.session?.expiresAt,121000);
 assert.throws(()=>call('verify',ids[0],{sessionId:s.id,nonce:s.nonce}),/another/);
 assert.throws(()=>call('verify',ids[2],{sessionId:s.id,nonce:s.nonce}),/invited/);
 assert.throws(()=>call('verify',ids[1],{sessionId:s.id,nonce:'WRONG1'}),/different/);
 const matched=call('verify',ids[1],{sessionId:s.id,nonce:s.nonce});assert.equal(matched.changed,true);
 assert.equal(call('verify',ids[1],{sessionId:s.id,nonce:s.nonce}).changed,false);
 assert.throws(()=>call('verify',ids[1],{sessionId:s.id,nonce:s.nonce},121000),/ended/);
 assert.equal(sessionView(s,121000)?.status,'expired');
 call('start',ids[0],{},121000);
 assert.throws(()=>call('verify',ids[1],{sessionId:s.id,nonce:s.nonce},121001),/ended/);
 const next=v.proximitySessions[1];
 call('cancel',ids[0],{sessionId:next.id},121002);
 assert.equal(call('cancel',ids[0],{sessionId:next.id},121003).changed,false);
 validateProximity(v);
 for(const mutate of [(s:typeof next)=>{s.matches.push({walletId:ids[2],verifiedAt:s.createdAt,attestationHash:'a'.repeat(64)})},(s:typeof next)=>{s.expiresAt++},(s:typeof next)=>{s.nonce='bad'}]) {
  const bad=structuredClone(v);mutate(bad.proximitySessions[1]);assert.throws(()=>validateVault(bad));
 }
 assert.equal(v.transactions.length,0);
});
test('start idempotency remains scoped to host and group', () => {
 const {v,ids,groupId}=fixture();
 const body={action:'start',groupId,walletId:ids[0]};
 const first=applyProximity(v,body,'stable',1000);
 assert.equal(applyProximity(v,body,'stable',1001).nonce,first.nonce);
 assert.equal(v.proximitySessions.length,1);
 assert.throws(()=>applyProximity(v,{...body,walletId:ids[1]},'stable',1001),/different input/);
 assert.throws(()=>applyProximity(v,body,'another',1001),/already active/);
 assert.equal(applyProximity(v,body,'stable',121000).nonce,undefined);
});
