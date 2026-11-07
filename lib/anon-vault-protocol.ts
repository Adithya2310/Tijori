import { decodeFunctionResult, encodeFunctionData, formatEther, formatUnits, getAddress, parseAbi, type Hex } from 'viem';
import type { SafeStatus } from '@tijori/client';

// Public testnet configuration only. No credentials or identity data enter this protocol.
export const VAULT_RPC = 'https://rpc.testnet.whitechain.io';
export const NYM_SPECIFIER = '0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0';
export const VAULT_USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
const GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
const safeAbi = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)', 'function nonce() view returns (uint256)']);
const tokenAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
export type VaultReadInput = { address: string; token: string };
export type RpcRead = { method: 'eth_chainId' | 'eth_getCode' | 'eth_getBalance' | 'eth_call' | 'eth_getStorageAt'; params: unknown[] };

/** Construct a fixed set of reads rather than accepting arbitrary RPC methods/calldata. */
export function vaultReadPlan(input: VaultReadInput): RpcRead[] {
 const address = getAddress(input.address), token = getAddress(input.token);
 return [
  { method: 'eth_chainId', params: [] },
  { method: 'eth_getCode', params: [address, 'latest'] },
  { method: 'eth_getBalance', params: [address, 'latest'] },
  ...(['getOwners', 'getThreshold', 'nonce'] as const).map(functionName => ({
   method: 'eth_call' as const, params: [{ to: address, data: encodeFunctionData({ abi: safeAbi, functionName }) }, 'latest'],
  })),
  { method: 'eth_call', params: [{ to: token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [address] }) }, 'latest'] },
  { method: 'eth_getStorageAt', params: [address, GUARD_SLOT, 'latest'] },
 ];
}

export function rpcResult(value: unknown, kind: 'quantity' | 'data'): Hex {
 if (!value || typeof value !== 'object') throw new Error('Invalid RPC response.');
 const rpc = value as { jsonrpc?: unknown; id?: unknown; error?: unknown; result?: unknown };
 if (rpc.jsonrpc !== '2.0' || rpc.id !== 1 || rpc.error !== undefined) throw new Error('RPC request failed or returned an invalid envelope.');
 const pattern = kind === 'quantity' ? /^0x(?:0|[1-9a-f][\da-f]*)$/i : /^0x(?:[\da-f]{2})*$/i;
 if (typeof rpc.result !== 'string' || rpc.result.length > 65_536 || !pattern.test(rpc.result)) throw new Error('Invalid RPC result.');
 return rpc.result as Hex;
}

export function decodeVaultRead(input: VaultReadInput, values: unknown): SafeStatus {
 if (!Array.isArray(values) || values.length !== 8) throw new Error('Incomplete vault read.');
 const results = values.map((result, index) => rpcResult({ jsonrpc: '2.0', id: 1, result }, index === 0 || index === 2 ? 'quantity' : 'data'));
 if (BigInt(results[0]) !== 1874n) throw new Error('Wrong chain: expected Whitechain Sepolia (1874).');
 if (results[1] === '0x') throw new Error('The vault is not deployed on Whitechain Sepolia.');
 const owners = decodeFunctionResult({ abi: safeAbi, functionName: 'getOwners', data: results[3] }).map(owner => getAddress(owner));
 const threshold = decodeFunctionResult({ abi: safeAbi, functionName: 'getThreshold', data: results[4] });
 const nonce = decodeFunctionResult({ abi: safeAbi, functionName: 'nonce', data: results[5] });
 const usdt = decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: results[6] });
 if (!owners.length || new Set(owners).size !== owners.length || threshold < 1n || threshold > BigInt(owners.length)) throw new Error('Invalid Safe owner configuration.');
 if (results[7].length !== 66 || !/^0x0{24}/i.test(results[7])) throw new Error('Invalid Safe guard storage.');
 const guard = BigInt(results[7]) === 0n ? null : getAddress(`0x${results[7].slice(-40)}`);
 return { address: getAddress(input.address), chainId: 1874, balanceWei: BigInt(results[2]).toString(), balanceEth: formatEther(BigInt(results[2])),
  balanceUsdt: formatUnits(usdt, 6), owners, threshold: Number(threshold), nonce: nonce.toString(), guard,
  rehearsalToken: getAddress(input.token) !== getAddress(VAULT_USDT) };
}
