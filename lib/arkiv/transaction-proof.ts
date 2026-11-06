import {decodeFunctionData,decodeAbiParameters,parseAbi,parseAbiParameters,type Hex} from 'viem';
const abi=parseAbi(['function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)']);
export function statePayload(input:Hex,entityKey:Hex) {
 const ops=decodeFunctionData({abi,data:input}).args[0];
 const matches=ops.flatMap(op=>{
  if(op.operation!==1&&op.operation!==2)return [];
  const params=op.operation===1?'(uint128 salt,uint64 expiresAt,uint64 minLifetime,uint8 creationFlags,(bytes32 name,uint8 typeId,bytes value)[] attributes)':'(bytes32 entityKey,(bytes32 name,uint8 typeId,bytes value)[] mutations)';
  const [payload]=decodeAbiParameters(parseAbiParameters(params),op.operationData) as unknown as [{entityKey?:Hex;attributes?:{name:Hex;typeId:number;value:Hex}[];mutations?:{name:Hex;typeId:number;value:Hex}[]}];
  if(op.operation===2&&payload.entityKey!==entityKey)return [];
  const attributes=Object.fromEntries((payload.attributes??payload.mutations??[]).map(a=>[Buffer.from(a.name.slice(2),'hex').toString('utf8').replace(/\0+$/,''),a]));
  if(!attributes.revision||!attributes.ciphertext||!attributes.namespace||!attributes.encoding)return [];
  for(const [name,type] of [['revision',3],['ciphertext',7],['namespace',8],['encoding',8]] as const)if((attributes[name].typeId&127)!==type)throw Error('Unexpected state attribute type.');
  return [{revision:BigInt(attributes.revision.value),ciphertext:attributes.ciphertext.value,namespace:Buffer.from(attributes.namespace.value.slice(2),'hex').toString('utf8'),encoding:Buffer.from(attributes.encoding.value.slice(2),'hex').toString('utf8')}];
 });
 if(matches.length!==1)throw Error('Transaction must contain exactly one identifiable state write.');
 return matches[0];
}
