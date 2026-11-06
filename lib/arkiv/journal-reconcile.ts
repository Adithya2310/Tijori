import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {defineSchema,bytes,str,u64} from '@arkiv-network/sdk/schema';
import {parseEther,type Hex} from 'viem';
import {arkivConfig,durableJson,StorageError,withArkiv} from './store.ts';
import {statePayload} from './transaction-proof.ts';
import {decryptState} from './codec.ts';
import type {Vault} from '../vault.ts';
const State=defineSchema('tichori_state_v1',{namespace:str().indexed(),revision:u64(),encoding:str(),ciphertext:bytes()});
const registry='0x4400000000000000000000000000000000000044';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function preserves(previous:Vault,next:Vault) {
 for(const field of ['wallets','groups','transactions','proximitySessions','proposals','invoices'] as const) {
  const ids=new Set(next[field].map(value=>value.id));
  if(previous[field].some(value=>!ids.has(value.id)))throw new StorageError('A previously verified record is absent. Explicit data-loss review is required.');
 }
 for(const wallet of previous.wallets){const newer=next.wallets.find(w=>w.id===wallet.id)!;
  if(wallet.objectProfileRef&&JSON.stringify(wallet.objectProfileRef)!==JSON.stringify(newer.objectProfileRef))throw new StorageError('A previously verified object pointer changed. Explicit enrollment review is required.');
  if(wallet.keyEnvelope&&JSON.stringify(wallet.keyEnvelope)!==JSON.stringify(newer.keyEnvelope))throw new StorageError('A previous identity envelope changed. Explicit key-change review is required.');
  if(wallet.objectProfile&&JSON.stringify(wallet.objectProfile)!==JSON.stringify(newer.objectProfile))throw new StorageError('A previously enrolled reference changed. Explicit enrollment review is required.');
 }
 // The operation history is bounded to 100, so only require the retained tail.
 const additions=next.operations.filter(op=>!previous.operations.some(old=>old.id===op.id)).length;
 const retained=previous.operations.slice(-Math.max(0,100-additions));
 if(retained.some(op=>!next.operations.some(n=>n.id===op.id&&n.digest===op.digest)))throw new StorageError('Previously verified operations were unexpectedly removed or changed.');
}
export async function reconcileJournal(hashes:Hex[],apply=false) {
 const config=arkivConfig();
 if(!hashes.length||hashes.length>20||new Set(hashes).size!==hashes.length||hashes.some(hash=>!/^0x[0-9a-f]{64}$/.test(hash)))throw new StorageError('Provide 1–20 distinct, explicitly reviewed transaction hashes.');
 return withArkiv(async store=>{
  const path=join(config.root,`arkiv-${config.account.address.toLowerCase()}-${config.namespace}.json`);
  const journal=JSON.parse(await readFile(path,'utf8'));
  if(journal.pending||!journal.entityKey||!journal.lastTxHash||!journal.revision||!journal.cipherHash)throw new StorageError('Reconcile the original signed pending write first; this operation only verifies forward history.');
  const context=`7794095:${journal.genesis}:${config.account.address.toLowerCase()}:${config.namespace}:1`;
  const proof=async(hash:Hex)=>{
   const tx=await store.reader.getTransaction({hash}),receipt=await store.reader.getTransactionReceipt({hash});
   if(receipt.status!=='success'||receipt.transactionHash!==hash||tx.from.toLowerCase()!==config.account.address.toLowerCase()||tx.to?.toLowerCase()!==registry||tx.chainId!==7794095||tx.value!==0n)throw new StorageError('Transaction does not prove an authorized successful state update.');
   const payload=statePayload(tx.input,journal.entityKey);
   if(payload.namespace!==config.namespace||payload.encoding!=='tichori/aes-256-gcm/v1')throw new StorageError('Transaction is bound to another namespace or encoding.');
   const vault=decryptState(Buffer.from(payload.ciphertext.slice(2),'hex'),config.key,context);
   const price=tx.gasPrice??tx.maxFeePerGas;
   if(price===undefined||price<receipt.effectiveGasPrice)throw new StorageError('Cannot verify the transaction fee reservation.');
   return {hash,nonce:tx.nonce,block:receipt.blockNumber,maximum:tx.gas*price,actual:receipt.gasUsed*receipt.effectiveGasPrice,payload,vault};
  };
  const anchor=await proof(journal.lastTxHash);
  if(anchor.payload.revision!==BigInt(journal.revision)||digest(anchor.payload.ciphertext)!==journal.cipherHash)throw new StorageError('Journal anchor does not match its original on-chain transaction.');
  let previous=anchor,maximum=0n;const verified=[];
  for(const hash of hashes){const next=await proof(hash);
   if(next.payload.revision!==previous.payload.revision+1n||next.nonce<=previous.nonce||next.block<previous.block)throw new StorageError('The supplied transactions do not prove a contiguous forward revision history.');
   preserves(previous.vault,next.vault);verified.push(next);maximum+=next.maximum;previous=next;
  }
  const remote=await store.reader.getEntity(journal.entityKey,State);
  if(remote.$owner.toLowerCase()!==config.account.address.toLowerCase()||remote.$creator.toLowerCase()!==config.account.address.toLowerCase()||remote.namespace.value!==config.namespace||remote.revision.value!==previous.payload.revision||remote.ciphertext.value!==previous.payload.ciphertext)throw new StorageError('Current Arkiv state does not equal the final verified transaction. Nothing was changed.');
  const reserved=BigInt(journal.reservedWei)+maximum;
  const cap=process.env.ARKIV_MAX_TOTAL_FEE_TGLM;
  if(!cap||reserved>parseEther(cap))throw new StorageError('Forward-history reservations exceed the approved namespace budget.');
  const report={fromRevision:journal.revision,toRevision:String(previous.payload.revision),entityKey:journal.entityKey,transactions:verified.map(tx=>({hash:tx.hash,nonce:tx.nonce,block:String(tx.block),revision:String(tx.payload.revision),maximumFeeWei:String(tx.maximum),actualFeeWei:String(tx.actual)})),previousReservedWei:journal.reservedWei,reservedWei:String(reserved),wallets:previous.vault.wallets.length,groups:previous.vault.groups.length,transactionsRetained:previous.vault.transactions.length,applied:apply};
  if(apply){
   const stamp=new Date().toISOString().replaceAll(':','-');
   await durableJson(path+`.before-reconcile-${stamp}.bak`,journal);
   const entry={at:new Date().toISOString(),fromRevision:journal.revision,toRevision:report.toRevision,hashes,previousCipherHash:journal.cipherHash};
   await durableJson(path,{...journal,revision:report.toRevision,cipherHash:digest(previous.payload.ciphertext),lastTxHash:previous.hash,lastFeeWei:String(previous.actual),reservedWei:String(reserved),reconciliations:[...(journal.reconciliations??[]),entry]});
  }
  return report;
 });
}
