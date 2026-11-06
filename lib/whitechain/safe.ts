import 'server-only';
import { getAddress, type Address } from 'viem';
import { SAFE_GUARD_SLOT, WHITECHAIN_CHAIN_ID } from '@tijori/core/whitechain/chain';
import { assertWhitechain, usdtAddress, whitechainClient } from './config.ts';
import { erc20Abi, safeAbi } from '@tijori/core/whitechain/safe-tx';

/** Live Safe status on Whitechain Sepolia: owners, threshold, nonce, guard, WBT and USDT balances. */
export async function readWhitechainSafe(address: Address) {
 const client = whitechainClient();
 await assertWhitechain(client);
 const safe = getAddress(address);
 if (!(await client.getCode({ address: safe }))) throw new Error('Safe is not deployed on Whitechain Sepolia.');
 const [owners, threshold, nonce, balanceWei, balanceUsdt, guardSlot] = await Promise.all([
  client.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }),
  client.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }),
  client.readContract({ address: safe, abi: safeAbi, functionName: 'nonce' }),
  client.getBalance({ address: safe }),
  client.readContract({ address: usdtAddress(), abi: erc20Abi, functionName: 'balanceOf', args: [safe] }),
  client.getStorageAt({ address: safe, slot: SAFE_GUARD_SLOT }),
 ]);
 const guard = guardSlot && BigInt(guardSlot) !== 0n ? getAddress(`0x${guardSlot.slice(-40)}`) : null;
 return { address: safe, chainId: WHITECHAIN_CHAIN_ID, owners: owners.map(o => getAddress(o)), threshold: Number(threshold), nonce, balanceWei, balanceUsdt, guard };
}
