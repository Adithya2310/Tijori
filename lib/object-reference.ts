export type ObjectProfileReference={version:1;entityKey:`0x${string}`;profileHash:string};
export function validObjectProfileReference(value:unknown):value is ObjectProfileReference {
 if(!value||typeof value!=='object')return false;
 const r=value as ObjectProfileReference;
 return Object.keys(r).sort().join(',')==='entityKey,profileHash,version'&&r.version===1&&typeof r.entityKey==='string'&&/^0x[0-9a-f]{64}$/.test(r.entityKey)&&typeof r.profileHash==='string'&&/^[0-9a-f]{64}$/.test(r.profileHash);
}
