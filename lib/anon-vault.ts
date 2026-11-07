'use client';
import { decodeVaultRead, vaultReadPlan, type VaultReadInput } from './anon-vault-protocol.ts';
import type { SafeStatus } from '@tijori/client';

export function readPrivateVault(input: VaultReadInput, signal: AbortSignal, timeoutMs = 90_000): Promise<SafeStatus> {
 vaultReadPlan(input);
 if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 90_000) throw new Error('Invalid vault read timeout.');
 return new Promise((resolve, reject) => {
  const frame = document.createElement('iframe'), channel = new MessageChannel();
  frame.hidden = true; frame.title = 'Private vault read via Nym';
  let settled = false, started = false;
  const finish = (error?: Error, status?: SafeStatus) => {
   if (settled) return;
   settled = true; clearTimeout(timer);
   signal.removeEventListener('abort', cancel); window.removeEventListener('message', ready);
   channel.port1.postMessage({ kind: 'close' }); channel.port1.close(); channel.port2.close();
   // Destroy the realm too: harness.close() alone cannot stop late bootstrap completion.
   frame.remove();
   if (error) reject(error); else resolve(status!);
  };
  const cancel = () => finish(new Error('Private read cancelled. No direct fallback was used.'));
  const ready = (event: MessageEvent) => {
   if (started || event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.kind !== 'vault-host-ready') return;
   started = true;
   frame.contentWindow!.postMessage({ kind: 'vault-read', input }, location.origin, [channel.port2]);
  };
  const timer = setTimeout(() => finish(new Error('Private read timed out. No direct fallback was used.')), timeoutMs);
  channel.port1.onmessage = event => {
   if (event.data?.kind === 'error') finish(new Error(`${String(event.data.message).slice(0, 300)} No direct fallback was used.`));
   else if (event.data?.kind === 'result') {
    try { finish(undefined, decodeVaultRead(input, event.data.values)); }
    catch (error) { finish(error instanceof Error ? error : new Error('Invalid vault response.')); }
   }
  };
  window.addEventListener('message', ready); signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) { cancel(); return; }
  frame.src = '/anon-rpc/vault-host';
  document.body.appendChild(frame);
 });
}
