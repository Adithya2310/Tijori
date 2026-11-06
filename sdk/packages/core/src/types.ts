import type { Hex } from 'viem';

/** Safe vault record stored in the aggregate. 84532 = legacy Base Sepolia; 1874 = guarded Whitechain Sepolia. */
export type SafeRecord = { address: `0x${string}`; chainId: 84532 | 1874; owners: `0x${string}`[]; threshold: number; deploymentTxHash: Hex; saltNonce: string; guard?: `0x${string}` };
