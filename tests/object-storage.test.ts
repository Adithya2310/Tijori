import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanFeatures} from './fixtures/object-scan.ts';
import {packMultiObjectProfile,unpackObjectProfile} from '../lib/object-profile.ts';
import {createObjectIdentity,parseObjectRecovery,verifyObjectRecovery} from '../lib/dino-wallet.ts';
import {findUsername} from '../lib/object-username.ts';

test('four-view username/reference roundtrip rejects the wrong object before login and survives isolated encrypted storage restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tichori-object-flow-'));
 const port=3187,base=`http://127.0.0.1:${port}/api/`;
 const env={...process.env,TICHORI_STORAGE_MODE:'local',LOCAL_DEMO_DATA_DIR:directory,ARKIV_ACCESS_KEY:'',ARKIV_WALLET_PRIVATE_KEY:'invalid-fixture-key',ARKIV_MAX_TOTAL_FEE_TGLM:'0'};
 let server:ChildProcess|undefined;
 async function request(path:string,body?:unknown,operation?:string) {
  const response=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json',...(operation?{'Idempotency-Key':operation}:{})},body:JSON.stringify(body)}:{});
  return {status:response.status,data:await response.json()};
 }
 async function start() {
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await request('state')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw Error('Object fixture server did not start.');
 }
 async function stop(){if(server&&server.exitCode===null){const ended=new Promise(r=>server!.once('exit',r));server.kill('SIGTERM');await ended;}}
 try {
  await start();
  const profile=packMultiObjectProfile([1,2,3,4].map(id=>scanFeatures(id)),'object-demo-v1');
  const recovery=await createObjectIdentity(unpackObjectProfile(profile),profile);
  const body={name:'Object.Fixture',address:recovery.address,keyEnvelope:recovery.keyEnvelope,objectProfile:profile,objectName:'dino-object-demo-v1'};
  const signup=await request('signup',body,'object-fixture-signup');assert.equal(signup.status,200);
  const records=(await request('object-identities')).data;
  assert.equal(records.storageMode,'local');assert.deepEqual(records.identities[0].objectProfile,profile);
  const stored=records.identities.map((record:typeof body)=>({name:record.name,recovery:parseObjectRecovery(JSON.stringify({...recovery,...record}))}));
  let loginRequests=0;
  async function login(username:string,photo:ReturnType<typeof scanFeatures>) {
   const identity=findUsername<{name:string;recovery:typeof recovery}>(stored,username);
   await verifyObjectRecovery(identity.recovery,photo);
   loginRequests++;
   return request('login',{username,address:identity.recovery.address,objectName:body.objectName});
  }
  await assert.rejects(login('object.fixture',scanFeatures(10,'pen')),/did not match/);
  await assert.rejects(login('object.fixture',scanFeatures(11,'bottle',64)),/did not match/);
  assert.equal(loginRequests,0,'wrong objects never trigger the login endpoint');
  const successful=await login(' Object.Fixture ',scanFeatures(12));assert.equal(successful.status,200);assert.equal(successful.data.identityId,signup.data.identityId);
  assert.equal((await request('login',{username:'someone-else',address:recovery.address,objectName:body.objectName})).status,400);
  assert.equal((await request('signup',{...body,name:'object.fixture',address:'0x'+'33'.repeat(20)},'duplicate-username')).status,400);
  const disk=await readFile(join(directory,'state.json'),'utf8');assert.ok(!disk.includes(profile.data));assert.ok(!disk.includes(body.name));assert.ok(!JSON.stringify((await request('state')).data).includes(profile.data));
  await stop();await start();assert.deepEqual((await request('object-identities')).data.identities[0].objectProfile,profile);
  assert.equal((await login('object.fixture',scanFeatures(13))).status,200);
 }finally{await stop();await rm(directory,{recursive:true,force:true});}
});
