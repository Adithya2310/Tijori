// Shared, non-secret Whitechain constants. Safe to import from client and server code.
import { getAddress, type Chain } from 'viem';
import { baseSepolia, whitechainSepolia } from 'viem/chains';

export const WHITECHAIN_CHAIN_ID = 1874;
export const LEGACY_SAFE_CHAIN_ID = 84532;
export const WHITECHAIN_DEFAULT_RPC = 'https://rpc.testnet.whitechain.io';
export const WHITECHAIN_EXPLORER = 'https://explorer.testnet.whitechain.io';
/** Hackathon test USDT on Whitechain Sepolia (TetherTokenV2, 6 decimals). */
export const WHITECHAIN_USDT = getAddress('0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7');
export const USDT_DECIMALS = 6;
/** Canonical Safe 1.4.1 deployments, preinstalled on Whitechain Sepolia. */
export const SAFE_141 = {
 factory: getAddress('0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'),
 singletonL2: getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'),
 fallbackHandler: getAddress('0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'),
} as const;
/** Safe 1.4.1 GuardManager storage slot: keccak256("guard_manager.guard.address"). */
export const SAFE_GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8' as const;

export type SafeChainId = typeof LEGACY_SAFE_CHAIN_ID | typeof WHITECHAIN_CHAIN_ID;
export type SafeNetwork = { chain: Chain; label: string; safePrefix: string; gasSymbol: string; explorer: string };
export const SAFE_NETWORKS: Record<SafeChainId, SafeNetwork> = {
 [LEGACY_SAFE_CHAIN_ID]: { chain: baseSepolia, label: 'Base Sepolia', safePrefix: 'basesep', gasSymbol: 'ETH', explorer: 'https://sepolia.basescan.org' },
 [WHITECHAIN_CHAIN_ID]: { chain: whitechainSepolia, label: 'Whitechain Sepolia', safePrefix: 'wch-sepolia', gasSymbol: 'WBT', explorer: WHITECHAIN_EXPLORER },
};
export const isSafeChainId = (value: unknown): value is SafeChainId => value === LEGACY_SAFE_CHAIN_ID || value === WHITECHAIN_CHAIN_ID;
export const explorerTx = (hash: string) => `${WHITECHAIN_EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${WHITECHAIN_EXPLORER}/address/${address}`;
export const safeAppUrl = (chainId: SafeChainId, address: string, page: 'home' | 'transactions/queue' = 'home') => `https://app.safe.global/${page}?safe=${SAFE_NETWORKS[chainId].safePrefix}:${address}`;

/** Parse a positive decimal USDT amount ("12.5") into 6-decimal base units. */
export function parseUsdt(value: unknown): bigint {
 const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
 if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) throw new Error('Enter a USDT amount with at most 6 decimals.');
 const [whole, fraction = ''] = text.split('.');
 const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
 if (units <= 0n) throw new Error('Enter a positive USDT amount.');
 return units;
}
export function formatUsdt(units: bigint | string): string {
 const value = BigInt(units), whole = value / 1_000_000n, fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
 return fraction ? `${whole}.${fraction}` : whole.toString();
}
