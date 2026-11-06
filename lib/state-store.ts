import type { Hex } from 'viem';
import type { Vault } from './vault.ts';
export type StateSnapshot = { vault: Vault; revision: bigint; entityKey: Hex | undefined; cipherHash?:string };
export type StateStore = {
 read(): Promise<StateSnapshot>;
 write(vault: Vault, previous: StateSnapshot): Promise<void>;
};
