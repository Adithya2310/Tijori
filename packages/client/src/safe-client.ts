'use client';
import { createPublicClient, custom, getAddress, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { LEGACY_PENDING_SAFE_KEY, LEGACY_SAFE_DEPLOY_LOCK } from '@tijori/core/legacy';
import type { PendingSafe } from '@tijori/core/api/types';
import { createTijoriClient, type TijoriClient } from './api.ts';

// Legacy Base Sepolia vaults: the user's own wallet deploys a plain Safe (no presence guard). New vaults use Whitechain.
const SAFE_CHAIN_ID = 84532;

type Provider = { request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown> };
// Read the injected wallet without a global Window augmentation (which would clash with integrators' own typings).
const injectedWallet = (): Provider | undefined => typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Provider }).ethereum;
export type { PendingSafe };
export const PENDING_SAFE_KEY = LEGACY_PENDING_SAFE_KEY;
export function readPendingSafe(): PendingSafe | null {
 const raw=localStorage.getItem(PENDING_SAFE_KEY); if(raw===null)return null;
 try { const value = JSON.parse(raw); if (!value || value.version !== 1 || typeof value.name !== 'string' || typeof value.creatorId !== 'string' || !Array.isArray(value.owners) || typeof value.address !== 'string' || !['awaiting-wallet', 'submitted'].includes(value.phase)) throw Error(); return value; } catch { throw new Error('Pending deployment record is invalid. Preserve it and reconcile before creating another vault.'); }
}
/** Request the user's wallet approval; never continue on an unverified network. */
export async function ensureBaseSepolia(provider: Provider): Promise<void> {
 if (Number(await provider.request({ method: 'eth_chainId' })) === SAFE_CHAIN_ID) return;
 const chainId = `0x${SAFE_CHAIN_ID.toString(16)}`;
 try {
  try {
   await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
   if ((error as { code?: number })?.code !== 4902) throw error;
   await provider.request({ method: 'wallet_addEthereumChain', params: [{
    chainId, chainName: baseSepolia.name, nativeCurrency: baseSepolia.nativeCurrency,
    rpcUrls: [baseSepolia.rpcUrls.default.http[0]],
    blockExplorerUrls: [baseSepolia.blockExplorers.default.url],
   }] });
   // Adding a network does not necessarily select it.
   if (Number(await provider.request({ method: 'eth_chainId' })) !== SAFE_CHAIN_ID) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
   }
  }
 } catch (error) {
  const code = (error as { code?: number })?.code;
  if (code === 4001) throw new Error('Network switch was declined. Select Base Sepolia in your wallet, then try again.');
  if (code === -32002) throw new Error('A wallet request is already open. Complete it in your wallet, then try again.');
  throw new Error('Could not switch networks. Select Base Sepolia (chain ID 84532) in your wallet, then try again.');
 }
 if (Number(await provider.request({ method: 'eth_chainId' })) !== SAFE_CHAIN_ID) {
  throw new Error('Your wallet is still on another network. Select Base Sepolia (chain ID 84532), then try again.');
 }
}
export async function deploySafe(name: string, creatorId: string, additionalOwners: string[], client: Pick<TijoriClient, 'prepareVault'> = createTijoriClient()): Promise<PendingSafe> {
 if (!navigator.locks) throw new Error('This browser does not support safe deployment coordination.');
 return navigator.locks.request(LEGACY_SAFE_DEPLOY_LOCK, { ifAvailable: true }, async lock => {
 if (!lock) throw new Error('Another vault deployment is already in progress.');
 if (readPendingSafe()) throw new Error('A deployment is already pending. Resume or reconcile it before creating another vault.');
 const provider = injectedWallet();
 if (!provider) throw new Error('Connect an EVM wallet browser extension to create a Base Sepolia vault.');
 const accounts = await provider.request({ method: 'eth_requestAccounts' });
 if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw new Error('Choose a wallet account to create the vault.');
 const creator = getAddress(accounts[0]);
 await ensureBaseSepolia(provider);
 const plan = await client.prepareVault(name, creatorId, [creator, ...additionalOwners]);
 if (plan.chainId !== SAFE_CHAIN_ID || getAddress(plan.owners[0]) !== creator) throw new Error('The deployment plan does not match this wallet.');
 const { owners, saltNonce } = plan;
 const address = getAddress(plan.address);
 const tx = plan.transaction;
 const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider, { retryCount: 0 }) });
 if (await reader.getBytecode({ address })) throw new Error('The predicted Safe is already deployed. Reconcile before proceeding.');
 if (Number(await provider.request({ method: 'eth_chainId' })) !== SAFE_CHAIN_ID) throw new Error('The wallet network changed.');
 const latest = await provider.request({ method: 'eth_accounts' });
 if (!Array.isArray(latest) || !latest.some(a => typeof a === 'string' && getAddress(a) === creator)) throw new Error('The selected wallet account changed.');
 const pending: PendingSafe = { version: 1, name, creatorId, owners, saltNonce, address, phase: 'awaiting-wallet' };
 localStorage.setItem(PENDING_SAFE_KEY, JSON.stringify(pending));
 let hash: unknown;
 try { hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: creator, to: tx.to, data: tx.data, value: `0x${BigInt(tx.value).toString(16)}` }] }); }
 catch (e) {
  if ((e as { code?: number })?.code === 4001) localStorage.removeItem(PENDING_SAFE_KEY);
  throw new Error((e as { code?: number })?.code === 4001 ? 'Wallet deployment was rejected.' : 'Wallet submission is uncertain. Reconcile the pending deployment before creating another vault.');
 }
 if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw new Error('Wallet returned an invalid transaction hash. Reconcile the pending deployment.');
 pending.phase = 'submitted'; pending.deploymentTxHash = hash as Hex;
 localStorage.setItem(PENDING_SAFE_KEY, JSON.stringify(pending));
 return pending;
 });
}
export async function waitForSafe(pending: PendingSafe): Promise<void> {
 const provider = injectedWallet();
 if (!provider) throw new Error('Connect your wallet to check the deployment.');
 if (!pending.deploymentTxHash) throw new Error('The deployment hash is missing. Find it in your wallet and enter it to resume.');
 await ensureBaseSepolia(provider);
 const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider, { retryCount: 0 }) });
 const receipt = await reader.waitForTransactionReceipt({ hash: pending.deploymentTxHash, timeout: 90000, pollingInterval: 2000 });
 if (receipt.status !== 'success') throw new Error('The Safe deployment reverted. Reconcile the pending transaction before continuing.');
}
