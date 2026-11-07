import { VAULT_RPC, rpcResult, vaultReadPlan, type VaultReadInput, type RpcRead } from './anon-vault-protocol.ts';

/** The caller must supply the Nym worker's fetch, never the browser's direct fetch. */
export async function readVaultThroughWorker(workerFetch: (url: string, init: RequestInit) => Promise<Response>, input: VaultReadInput, signal: AbortSignal) {
 const plan = vaultReadPlan(input);
 const read = async (request: RpcRead) => {
  const response = await workerFetch(VAULT_RPC, {
   method: 'POST', headers: { 'content-type': 'application/json' }, signal,
   body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...request }),
  });
  if (!response.ok) throw new Error(`Vault RPC: HTTP ${response.status}`);
  return rpcResult(await response.json(), ['eth_chainId', 'eth_getBalance'].includes(request.method) ? 'quantity' : 'data');
 };
 // Check the chain before revealing the vault address, and deployment before calling its ABI.
 const chain = await read(plan[0]);
 if (BigInt(chain) !== 1874n) throw new Error('Wrong chain: expected Whitechain Sepolia (1874).');
 const code = await read(plan[1]);
 if (code === '0x') throw new Error('The vault is not deployed on Whitechain Sepolia.');
 return [chain, code, ...await Promise.all(plan.slice(2).map(read))];
}
