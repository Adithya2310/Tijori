import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {privateKeyToAccount} from 'viem/accounts';
import {rpcFixture} from './rpc-fixture.mjs';
import {withArkiv} from '../lib/arkiv/store.ts';
import {reconcileJournal} from '../lib/arkiv/journal-reconcile.ts';
import {applyAction} from '../lib/vault.ts';
import {scanFeatures} from './fixtures/object-scan.ts';
import {packMultiObjectProfile} from '../lib/object-profile.ts';
import {projectedObjectStateBytes} from '../lib/arkiv/object-codec.ts';

test('Arkiv atomic object records, restart, uncertain receipt and proof-based journal recovery',async()=>{
 const rpc=await rpcFixture(),root=await mkdtemp(join(tmpdir(),'arkiv-objects-')),other=await mkdtemp(join(tmpdir(),'arkiv-writer-'));
 const oldEnv={...process.env},originalFetch=globalThis.fetch;
 const privateKey=('0x'+'33'.repeat(32)) as `0x${string}`,account=privateKeyToAccount(privateKey);
 Object.assign(process.env,{ARKIV_ACCESS_KEY:'fixture',ARKIV_WALLET_PRIVATE_KEY:privateKey,ARKIV_WALLET_ADDRESS:account.address,ARKIV_STATE_ENCRYPTION_KEY:'44'.repeat(32),ARKIV_NAMESPACE:'object-fixture',ARKIV_MAX_TOTAL_FEE_TGLM:'0.1',VAULT_DATA_DIR:root});
 globalThis.fetch=((url:RequestInfo|URL,init?:RequestInit)=>originalFetch(String(url).includes('rpc.rabdi.db-chain.testnet.arkiv.network')?rpc.url:url,init)) as typeof fetch;
 const profile=packMultiObjectProfile([1,2,3,4].map(id=>scanFeatures(id)),'object-demo-v1');
 const envelope={version:1 as const,salt:'aa'.repeat(16),iv:'bb'.repeat(12),ciphertext:'cc'.repeat(48)};
 const add=async(n:number)=>withArkiv(async store=>{const previous=await store.read();applyAction(previous.vault,'signup',{name:`Fixture ${n}`,address:'0x'+n.toString(16).padStart(40,'0'),objectName:'dino-object-demo-v1',keyEnvelope:envelope,objectProfile:profile});await store.write(previous.vault,previous);return store.journal();});
 try{
  await add(1);assert.equal(rpc.entities().size,2);assert.equal(rpc.control.sends,1);
  const first=await withArkiv(async store=>(await store.read()).vault);assert.deepEqual(first.wallets[0].objectProfile,profile);assert.ok(first.wallets[0].objectProfileRef);
  const journalName=(await readdir(root)).find(name=>name.endsWith('.json'))!;
  await copyFile(join(root,journalName),join(other,journalName));
  process.env.VAULT_DATA_DIR=other;
  const second=await add(2);const third=await add(3);
  assert.equal(rpc.entities().size,4);assert.equal(rpc.control.sends,3);
  const loaded=await withArkiv(async store=>(await store.read()).vault);
  assert.ok(Buffer.byteLength(JSON.stringify(loaded))>100_000);assert.ok(projectedObjectStateBytes(loaded)<10_000);
  process.env.VAULT_DATA_DIR=root;
  await assert.rejects(withArkiv(store=>store.read()),/differs from the verified journal/);
  // Reconciliation of object-bearing history validates immutable profile pointers too.
  const hashes=[second.lastTxHash!,third.lastTxHash!];
  const sends=rpc.control.sends;
  const journalBeforeProof=await readFile(join(root,journalName),'utf8');
  await assert.rejects(reconcileJournal([...hashes].reverse()),/contiguous/);
  await assert.rejects(reconcileJournal([hashes[0],hashes[0]]),/distinct/);
  assert.equal(await readFile(join(root,journalName),'utf8'),journalBeforeProof);
  assert.equal((await reconcileJournal(hashes)).applied,false);
  assert.equal((await reconcileJournal(hashes,true)).toRevision,'3');
  assert.equal(rpc.control.sends,sends);assert.ok((await readdir(root)).some(name=>name.includes('before-reconcile')));
  assert.equal((await withArkiv(async store=>(await store.read()).vault)).wallets.length,3);
  const ref=loaded.wallets[0].objectProfileRef!,record=rpc.entities().get(ref.entityKey)!;
  rpc.entities().delete(ref.entityKey);await assert.rejects(withArkiv(store=>store.read()),/Cannot retrieve/);rpc.entities().set(ref.entityKey,record);
  const oldCipher=record.attributes.find((a:{name:string})=>a.name==='ciphertext');const value=oldCipher.value;oldCipher.value='0x'+'00'.repeat(100);
  await assert.rejects(withArkiv(store=>store.read()),/Cannot retrieve/);oldCipher.value=value;
  rpc.control.loseSendResponse=true;await assert.rejects(add(4),/requires reconciliation/);
  const afterLost=rpc.control.sends;
  assert.equal((await withArkiv(async store=>(await store.read()).vault)).wallets.length,4);assert.equal(rpc.control.sends,afterLost);
  // Remote change between read and signing must abort before budget reservation.
  await withArkiv(async store=>{const previous=await store.read(),row=rpc.entity(),revision=row.attributes.find((a:{name:string})=>a.name==='revision'),saved=revision.value;
   revision.value='0x99';const journalBefore=await readFile(join(root,journalName),'utf8');
   const beforeSend=rpc.control.sends;
   await assert.rejects(store.write(previous.vault,previous),/no transaction was broadcast|changed after it was read/);
   assert.equal(rpc.control.sends,beforeSend);
   assert.equal(await readFile(join(root,journalName),'utf8'),journalBefore);revision.value=saved;
  });
 }finally{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);await rpc.close();await rm(root,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
