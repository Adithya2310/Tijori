// Read-only transport contract, independent of vaults, identity, and chain integration.
export const NYM_SPECIFIER = '0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0';
export const WHITECHAIN_TESTNET = {
 name: 'Whitechain Sepolia', endpoint: 'https://rpc.testnet.whitechain.io', chainId: '0x752',
} as const;
export type ReadRequest = { endpoint: string; method: 'eth_chainId' | 'eth_getBalance' | 'eth_call'; params: unknown[] };
export type DiagnosticMode = 'normal' | 'bootstrap-failure' | 'timeout';
export function validateReadRequest(value: ReadRequest) {
 const url = new URL(value.endpoint);
 if (url.protocol !== 'https:' || url.username || url.password) throw new Error('An HTTPS RPC endpoint without credentials is required.');
 if (value.method === 'eth_chainId' && Array.isArray(value.params) && value.params.length === 0) return;
 if (value.method === 'eth_getBalance' && value.params.length === 2 && typeof value.params[0] === 'string' && /^0x[\da-f]{40}$/i.test(value.params[0]) && value.params[1] === 'latest') return;
 const call = value.params?.[0];
 if (value.method === 'eth_call' && value.params.length === 2 && value.params[1] === 'latest' && call && typeof call === 'object' && Object.keys(call).sort().join(',') === 'data,to') {
  const { to, data } = call as { to?: unknown; data?: unknown };
  if (typeof to === 'string' && /^0x[\da-f]{40}$/i.test(to) && typeof data === 'string' && /^0x70a082310{24}[\da-f]{40}$/i.test(data)) return;
 }
 throw new Error('Only eth_chainId, latest eth_getBalance and ERC-20 balanceOf reads are allowed.');
}
export function parseRpcQuantity(value: unknown): string {
 if (!value || typeof value !== 'object') throw new Error('RPC returned an invalid JSON-RPC envelope.');
 const rpc = value as { jsonrpc?: unknown; id?: unknown; error?: { code?: unknown; message?: unknown }; result?: unknown };
 if (rpc.jsonrpc !== '2.0' || rpc.id !== 1) throw new Error('RPC returned an invalid JSON-RPC envelope.');
 if (rpc.error) throw new Error(`RPC error ${String(rpc.error.code)}: ${String(rpc.error.message).slice(0, 300)}`);
 if (typeof rpc.result !== 'string' || !/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(rpc.result)) throw new Error('RPC returned an invalid hex quantity.');
 return rpc.result;
}
export function parseRpcBalanceOf(value: unknown): string {
 if (!value || typeof value !== 'object') throw new Error('RPC returned an invalid JSON-RPC envelope.');
 const rpc = value as { jsonrpc?: unknown; id?: unknown; error?: { code?: unknown; message?: unknown }; result?: unknown };
 if (rpc.jsonrpc !== '2.0' || rpc.id !== 1) throw new Error('RPC returned an invalid JSON-RPC envelope.');
 if (rpc.error) throw new Error(`RPC error ${String(rpc.error.code)}: ${String(rpc.error.message).slice(0, 300)}`);
 if (typeof rpc.result !== 'string' || !/^0x[\da-f]{64}$/i.test(rpc.result)) throw new Error('RPC returned an invalid ERC-20 balance.');
 return rpc.result;
}
export function verifyTestnetChain(result: string): string {
 if (BigInt(result) !== BigInt(WHITECHAIN_TESTNET.chainId)) throw new Error(`Wrong chain: received ${result}; expected ${WHITECHAIN_TESTNET.chainId} (1874).`);
 return result;
}
