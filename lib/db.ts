import 'server-only';
import { withArkiv, StorageError } from './arkiv/store.ts';
import { withLocalStore } from './local-store.ts';
import type { StateStore } from './state-store.ts';
export { StorageError };
export function storageMode(): 'local' | 'arkiv' {
 const mode = process.env.TICHORI_STORAGE_MODE || 'arkiv';
 if (mode !== 'local' && mode !== 'arkiv') throw new StorageError('TICHORI_STORAGE_MODE must be local or arkiv.');
 return mode;
}
export function withState<T>(work: (store: StateStore) => Promise<T>): Promise<T> {
 return storageMode() === 'local' ? withLocalStore(work) : withArkiv(work);
}
