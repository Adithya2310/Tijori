// Host side of Anon RPC: run on a dedicated same-origin page (loaded hidden in an iframe by requestViaNym).
// Usage in that page: useEffect(() => startAnonRpcHost(), []). Returns a cleanup function.
import { NYM_SPECIFIER, parseRpcQuantity, validateReadRequest, type ReadRequest } from './anon-rpc-protocol.ts';

export function startAnonRpcHost(options: { bootstrapRpcUrl?: string } = {}): () => void {
 if (window.parent === window) return () => {};
 const bootstrapRpcUrl = options.bootstrapRpcUrl ?? 'https://ethereum-rpc.publicnode.com';
 let used = false, disposed = false;
 let worker: import('@anon-rpc/browser-harness').AnonRpcWorker | undefined;
 let port: MessagePort | undefined;
 const controller = new AbortController();
 const close = () => { disposed = true; controller.abort(); worker?.close(); };
 const receive = async (event: MessageEvent) => {
  if (used || event.source !== window.parent || event.origin !== location.origin || event.data?.kind !== 'nym-read' || !event.ports[0]) return;
  used = true; port = event.ports[0];
  port.onmessage = message => { if (message.data?.kind === 'close') close(); };
  try {
   const request: ReadRequest = event.data.request;
   validateReadRequest(request);
   // A deterministic timeout fixture: no worker, bootstrap, or RPC traffic.
   if (event.data.mode === 'timeout') return;
   const { AnonRpcWorker } = await import('@anon-rpc/browser-harness');
   if (disposed) return;
   const bootstrap = { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (event.data.mode === 'bootstrap-failure') throw new Error('Intentional bootstrap failure (local test; no RPC sent).');
    const response = await fetch(bootstrapRpcUrl, {
     method: 'POST', headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
     signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error(`Ethereum specifier bootstrap: HTTP ${response.status}`);
    const rpc = await response.json();
    if (rpc.error || !('result' in rpc)) throw new Error(`Ethereum specifier bootstrap failed: ${rpc.error?.message ?? 'missing result'}`);
    return rpc.result;
   } };
   worker = new AnonRpcWorker({ address: NYM_SPECIFIER, config: {}, preExisting: { rpcProvider: bootstrap } });
   await worker.ready;
   const response = await worker.fetch(request.endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: request.method, params: request.params }),
   });
   if (!response.ok) throw new Error(`Destination RPC: HTTP ${response.status}`);
   port.postMessage({ kind: 'result', result: parseRpcQuantity(await response.json()) });
  } catch (error) {
   port?.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
   close();
  }
 };
 window.addEventListener('message', receive);
 window.parent.postMessage({ kind: 'nym-host-ready' }, location.origin);
 return () => { window.removeEventListener('message', receive); close(); port?.close(); };
}
