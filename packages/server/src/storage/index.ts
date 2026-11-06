// Storage selection. The active adapter comes from the server context (config.storage) or, outside a server,
// from the TIJORI_STORAGE_MODE setting ('arkiv' by default, or 'local').
import type { StateStore } from '@tijori/core/state-store';
import { withArkiv, StorageError } from './arkiv.ts';
import { withLocalStore } from './local-file.ts';
import { memoryStorage } from './memory.ts';
import { currentStorage, registerDefaults, setting, type StorageAdapter } from '../context.ts';

export { StorageError, memoryStorage };
/** Encrypted aggregate on Arkiv (paid writes, journaled, one signer per data directory). */
export const arkivStorage = (): StorageAdapter => ({ mode: 'arkiv', transact: work => withArkiv(work) });
/** Encrypted aggregate in a local file. Explicit opt-in; suitable for single-machine demos and tests. */
export const localFileStorage = (directory?: string): StorageAdapter => ({ mode: 'local', transact: work => withLocalStore(work, directory ?? setting('LOCAL_DEMO_DATA_DIR')) });
export function storageFromSettings(): StorageAdapter {
 const mode = setting('TIJORI_STORAGE_MODE') || 'arkiv';
 if (mode === 'local') return localFileStorage();
 if (mode === 'arkiv') return arkivStorage();
 throw new StorageError('TIJORI_STORAGE_MODE must be local or arkiv.');
}
registerDefaults({ storage: storageFromSettings });
export const storageMode = () => currentStorage().mode;
export const withState = <T>(work: (store: StateStore) => Promise<T>): Promise<T> => currentStorage().transact(work);
