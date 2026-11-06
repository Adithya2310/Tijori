'use client';

import { formatEther, type Address } from 'viem';
import { validateReadRequest, type ReadRequest, type DiagnosticMode } from './anon-rpc-protocol.ts';

// Own the entire harness realm, not just its inner worker: harness 0.4.0 can
// finish bundle resolution AFTER close(). Removing this frame also kills that
// pending bootstrap, its fetches, nested sandbox, and any late-created worker.
export function requestViaNym(request: ReadRequest, options: {
 signal?: AbortSignal; mode?: DiagnosticMode; timeoutMs?: number;
 /** Same-origin page that calls startAnonRpcHost(). Default '/diagnostics/anon-rpc/host'. */
 hostUrl?: string;
} = {}): Promise<string> {
 validateReadRequest(request);
 const timeoutMs = options.timeoutMs ?? 90_000;
 if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 90_000) throw new Error('Timeout must be between 1 and 90000 ms.');
 return new Promise((resolve, reject) => {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Nym RPC harness host';
  const channel = new MessageChannel();
  let settled = false, started = false;
  const finish = (error?: Error, result?: string) => {
   if (settled) return;
   settled = true;
   clearTimeout(timer);
   options.signal?.removeEventListener('abort', cancel);
   window.removeEventListener('message', ready);
   // Ask for normal close before destroying the containing browsing context.
   channel.port1.postMessage({ kind: 'close' });
   channel.port1.close(); channel.port2.close(); frame.remove();
   if (error) reject(error); else resolve(result!);
  };
  const cancel = () => finish(new Error('Anon RPC cancelled. No direct fallback was used.'));
  const ready = (event: MessageEvent) => {
   if (started || event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.kind !== 'nym-host-ready') return;
   started = true;
   frame.contentWindow!.postMessage({ kind: 'nym-read', request, mode: options.mode ?? 'normal' }, location.origin, [channel.port2]);
  };
  const timer = setTimeout(() => finish(new Error(`Anon RPC timed out after ${timeoutMs / 1000}s. No direct fallback was used.`)), timeoutMs);
  channel.port1.onmessage = (event) => {
   if (event.data?.kind === 'result' && typeof event.data.result === 'string') finish(undefined, event.data.result);
   else if (event.data?.kind === 'error') finish(new Error(String(event.data.message).slice(0, 500)));
  };
  window.addEventListener('message', ready);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) { cancel(); return; }
  frame.src = options.hostUrl ?? '/diagnostics/anon-rpc/host';
  document.body.appendChild(frame);
 });
}

export async function readAnonymousBalance(address: Address, options: { hostUrl?: string; signal?: AbortSignal } = {}): Promise<string> {
 return formatEther(BigInt(await requestViaNym({ endpoint: 'https://sepolia.base.org', method: 'eth_getBalance', params: [address, 'latest'] }, options)));
}
