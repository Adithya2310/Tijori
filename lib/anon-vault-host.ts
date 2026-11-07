'use client';
import { NYM_SPECIFIER, rpcResult, vaultReadPlan, type VaultReadInput } from './anon-vault-protocol.ts';
import { readVaultThroughWorker } from './anon-vault-reader.ts';

/** One owning iframe per vault refresh contains all bootstrap work and the Nym sandbox. */
export function startVaultReadHost() {
 if (window.parent === window) return () => {};
 let used = false, disposed = false;
 let worker: import('@anon-rpc/browser-harness').AnonRpcWorker | undefined;
 let port: MessagePort | undefined;
 const controller = new AbortController();
 const close = () => { disposed = true; controller.abort(); worker?.close(); };
 const receive = async (event: MessageEvent) => {
  if (used || event.source !== window.parent || event.origin !== location.origin || event.data?.kind !== 'vault-read' || !event.ports[0]) return;
  used = true; port = event.ports[0];
  port.onmessage = message => { if (message.data?.kind === 'close') close(); };
  try {
   const input = event.data.input as VaultReadInput;
   vaultReadPlan(input);
   const { AnonRpcWorker } = await import('@anon-rpc/browser-harness');
   if (disposed) return;
   worker = new AnonRpcWorker({ address: NYM_SPECIFIER, config: {}, preExisting: { rpcProvider: {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
     // Direct bootstrap reads only the public Ethereum worker specifier, never a vault.
     if (!['eth_call', 'eth_chainId', 'eth_getCode'].includes(method)) throw new Error('Unsupported bootstrap method.');
     const response = await fetch('https://ethereum-rpc.publicnode.com', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      credentials: 'omit', redirect: 'error',
     });
     if (!response.ok) throw new Error(`Worker bootstrap: HTTP ${response.status}`);
     return rpcResult(await response.json(), method === 'eth_chainId' ? 'quantity' : 'data');
    },
   } } });
   await worker.ready;
   if (disposed) return;
   const values = await readVaultThroughWorker(worker.fetch.bind(worker), input, controller.signal);
   if (!disposed) port.postMessage({ kind: 'result', values });
  } catch (error) {
   if (!disposed) port?.postMessage({ kind: 'error', message: error instanceof Error ? error.message.slice(0, 300) : 'Private vault read failed.' });
  } finally { close(); }
 };
 window.addEventListener('message', receive);
 window.parent.postMessage({ kind: 'vault-host-ready' }, location.origin);
 return () => { window.removeEventListener('message', receive); close(); port?.close(); };
}
