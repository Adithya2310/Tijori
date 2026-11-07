import type { ApplicationState, TijoriClient } from '@tijori/client';
import { readPrivateVault } from './anon-vault.ts';
import { VAULT_USDT } from './anon-vault-protocol.ts';

export type ReadState = { phase: 'idle' | 'loading' | 'success' | 'error'; updatedAt?: number; error?: string };
const idle: ReadState = { phase: 'idle' };

/** App-only decoration of the published client's public balance interface. */
export function privateVaultClient(base: TijoriClient, token = VAULT_USDT, read = readPrivateVault) {
 let groups: ApplicationState['groups'] = [];
 const states = new Map<string, ReadState>(), listeners = new Set<() => void>();
 const pending = new Map<string, { controller: AbortController; promise: ReturnType<typeof read> }>();
 const publish = (id: string, state: ReadState) => { states.set(id, state); listeners.forEach(listener => listener()); };
 const observe = <Args extends unknown[], Result extends ApplicationState>(fn: (...args: Args) => Promise<Result>) => async (...args: Args) => {
  const result = await fn(...args); groups = result.groups; return result;
 };
 const client: TijoriClient = {
  ...base,
  state: observe(base.state), mutate: observe(base.mutate),
  createWhitechainVault: observe(base.createWhitechainVault), propose: observe(base.propose),
  balance: (id: string) => {
   const existing = pending.get(id);
   if (existing) return existing.promise;
   const safe = groups.find(group => group.id === id)?.safe;
   if (!safe || safe.chainId !== 1874) return Promise.reject(new Error('Private reads require a registered Whitechain vault.'));
   const controller = new AbortController();
   const previous = states.get(id)?.updatedAt;
   publish(id, { phase: 'loading', updatedAt: previous });
   // Start in a microtask so even synchronous validation errors settle through the same cleanup.
   const promise = Promise.resolve().then(() => read({ address: safe.address, token }, controller.signal)).then(result => {
    if (!controller.signal.aborted) publish(id, { phase: 'success', updatedAt: Date.now() });
    return result;
   }, error => {
    if (!controller.signal.aborted) publish(id, { phase: 'error', updatedAt: previous, error: error instanceof Error ? error.message : 'Private read failed.' });
    throw error;
   }).finally(() => { if (pending.get(id)?.controller === controller) pending.delete(id); });
   pending.set(id, { controller, promise });
   return promise;
  },
 };
 const cancel = (id: string) => {
  const active = pending.get(id);
  if (active) { pending.delete(id); active.controller.abort(); publish(id, { phase: 'idle', updatedAt: states.get(id)?.updatedAt }); }
 };
 return {
  client,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: (id: string) => states.get(id) ?? idle,
  cancel,
  cancelAll: () => { for (const id of pending.keys()) cancel(id); },
 };
}
