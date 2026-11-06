import { emptyVault, validateVault, type Vault } from '@tijori/core/vault';
import type { StateSnapshot, StateStore } from '@tijori/core/state-store';
import { StorageError } from './arkiv.ts';
import type { StorageAdapter } from '../context.ts';

/** In-memory storage for tests, previews and demos. State is lost when the process exits. */
export function memoryStorage(initial: Vault = emptyVault()): StorageAdapter {
 let snapshot: StateSnapshot = { vault: structuredClone(validateVault(initial)), revision: 0n, entityKey: undefined };
 let queue: Promise<unknown> = Promise.resolve();
 const store: StateStore = {
  async read() { return { vault: structuredClone(snapshot.vault), revision: snapshot.revision, entityKey: undefined }; },
  async write(vault, previous) {
   if (previous.revision !== snapshot.revision) throw new StorageError('State changed. Refresh before retrying.');
   snapshot = { vault: structuredClone(validateVault(vault)), revision: snapshot.revision + 1n, entityKey: undefined };
  },
 };
 return {
  mode: 'memory',
  transact<T>(work: (store: StateStore) => Promise<T>) {
   const run = queue.then(() => work(store), () => work(store));
   queue = run.catch(() => undefined);
   return run;
  },
 };
}
