import { createServer } from 'node:http';
import { parseTransaction, recoverTransactionAddress, decodeFunctionData, decodeAbiParameters, parseAbi, parseAbiParameters, keccak256, toHex, encodeEventTopics, encodeAbiParameters } from 'viem';
import { ENTITY_EVENTS_ABI, predictEntityKey } from '@arkiv-network/sdk/entity';
const registry = '0x4400000000000000000000000000000000000044';
const abi = parseAbi(['function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)']);
const attrs = '(bytes32 name, uint8 typeId, bytes value)[]';
const key = `0x${'ab'.repeat(32)}`, blockHash = `0x${'cd'.repeat(32)}`;
export async function rpcFixture() {
 let entity, nonce = 0, entityNonce = 0n; let entities = new Map(); const receipts = new Map(), transactions = new Map();
 const control = { sends: 0, failQuery: false, loseSendResponse: false, hideReceipt: false, failEstimate: false, duplicate: false, gasPrice: 1n, reset: false, erase: false, requests: [] };
 const server = createServer(async (req, res) => {
  try {
   let body = ''; for await (const chunk of req) body += chunk;
   const { id, method, params = [] } = JSON.parse(body); control.requests.push(method);
   let result;
   switch (method) {
    case 'eth_chainId': result = toHex(7794095); break;
    case 'eth_blockNumber': result = '0x64'; break;
    case 'eth_getBlockByNumber': result = { number: params[0] === '0x0' ? '0x0' : '0x64', hash: control.reset ? key : blockHash, parentHash: blockHash, nonce: '0x0000000000000000', sha3Uncles: blockHash, logsBloom: `0x${'00'.repeat(256)}`, transactionsRoot: blockHash, stateRoot: blockHash, receiptsRoot: blockHash, miner: registry, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x1', gasLimit: '0x5f5e100', gasUsed: '0x0', timestamp: '0x1', transactions: [], uncles: [] }; break;
    case 'eth_call': result = encodeAbiParameters(parseAbiParameters('uint64'), [entityNonce]); break;
    case 'arkiv_getEntity': result = control.erase ? null : entities.get(params[0]) || null; break;
    case 'eth_getBalance': result = toHex(10n ** 20n); break;
    case 'eth_getTransactionCount': result = toHex(nonce); break;
    case 'eth_gasPrice': result = toHex(control.gasPrice); break;
    case 'eth_estimateGas': if (control.failEstimate) throw Error('fixture estimate failed'); result = '0x7a120'; break;
    case 'arkiv_query':
     if (control.failQuery) throw Error('fixture query failed');
     result = { blockNumber: '0x64', data: entity && !control.erase ? (control.duplicate ? [entity, entity] : [entity]) : [] }; break;
    case 'eth_sendRawTransaction': {
     control.sends++;
     const raw = params[0], tx = parseTransaction(raw), from = await recoverTransactionAddress({ serializedTransaction: raw }), hash = keccak256(raw);
     const ops = decodeFunctionData({ abi, data: tx.data }).args[0];
     const next = new Map(entities), logs = []; let nextNonce=entityNonce, main=entity;
     for (const op of ops) {
      const create = op.operation === 1;
      if(!create && op.operation!==2) throw Error('Unexpected operation');
      const payload = decodeAbiParameters(parseAbiParameters(create ? `(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, ${attrs} attributes)` : `(bytes32 entityKey, ${attrs} mutations)`), op.operationData)[0];
      const incoming = (payload.attributes || payload.mutations).map(a => { const type = ({ 3: 'u64', 7: 'bytes', 8: 'str' })[a.typeId & 127]; if (!type) throw Error('Unexpected attribute'); return { name: Buffer.from(a.name.slice(2), 'hex').toString('utf8').replace(/\0+$/, ''), type, value: type === 'str' ? Buffer.from(a.value.slice(2), 'hex').toString('utf8') : type === 'u64' ? toHex(BigInt(a.value)) : a.value }; });
      const isState=incoming.some(a=>a.name==='revision');
      const entityKey=create?(ops.length===1 && isState?key:predictEntityKey({owner:from,nonce:nextNonce,salt:payload.salt,chainId:7794095})):payload.entityKey;
      const previous=next.get(entityKey);
      if(!create&&!previous)throw Error('Missing target');
      const row={key:entityKey,creator:from,owner:from,createdAt:'0x64',updatedAt:'0x64',expiresAt:toHex(create?payload.expiresAt:BigInt(previous.expiresAt)),creationFlags:create?payload.creationFlags:previous.creationFlags,attributes:[...(previous?.attributes||[]).filter(a=>!incoming.some(b=>b.name===a.name)),...incoming]};
      next.set(entityKey,row);if(isState)main=row;
      if(create)nextNonce++;
      const topics=encodeEventTopics({abi:ENTITY_EVENTS_ABI,eventName:create?'EntityCreated':'EntityPatched',args:{entityKey,owner:from}});
      const data=create?encodeAbiParameters(parseAbiParameters('uint64,uint8'),[payload.expiresAt,payload.creationFlags]):'0x';
      logs.push({address:registry,topics,data,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',blockHash,logIndex:toHex(logs.length),removed:false});
     }
     entities=next;entityNonce=nextNonce;entity=main;
     transactions.set(hash, { hash, from, to: registry, input: tx.data, value: '0x0', nonce: toHex(tx.nonce), gas: toHex(tx.gas), gasPrice: toHex(tx.gasPrice), chainId: toHex(tx.chainId), type: '0x0', blockHash, blockNumber: '0x64', transactionIndex: '0x0', v: '0x1b', r: tx.r, s: tx.s });
     receipts.set(hash, { transactionHash: hash, transactionIndex: '0x0', blockHash, blockNumber: '0x64', from, to: registry, cumulativeGasUsed: '0x7a120', gasUsed: '0x7a120', contractAddress: null, logs, logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', effectiveGasPrice: toHex(tx.gasPrice), type: '0x0' });
     nonce++; result = hash;
     if (control.loseSendResponse) { control.loseSendResponse = false; throw Error('fixture lost send response'); }
     break;
    }
    case 'eth_getTransactionReceipt': result = control.hideReceipt ? null : receipts.get(params[0]) || null; break;
    case 'eth_getTransactionByHash': result = transactions.get(params[0]) || null; break;
    default: throw Error(`Unsupported fixture RPC: ${method}`);
   }
   res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  } catch { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'fixture failure' } })); }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 return { url: `http://127.0.0.1:${server.address().port}`, control, entity: () => entity, entities: () => entities, close: () => new Promise(resolve => server.close(resolve)) };
}
