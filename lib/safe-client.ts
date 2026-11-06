'use client';
import { createPublicClient, custom, getAddress, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { normalizeOwners, prepareSafe, SAFE_CHAIN_ID } from './safe.ts';

type Provider = { request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }
export type PendingSafe = { version: 1; name: string; creatorId: string; owners: `0x${string}`[]; saltNonce: string; address: `0x${string}`; phase: 'awaiting-wallet' | 'submitted'; deploymentTxHash?: Hex };
export const PENDING_SAFE_KEY = 'tichori-pending-safe-v1';
export function readPendingSafe(): PendingSafe | null {
 const raw=localStorage.getItem(PENDING_SAFE_KEY); if(raw===null)return null;
 try { const value = JSON.parse(raw); if (!value || value.version !== 1 || typeof value.name !== 'string' || typeof value.creatorId !== 'string' || !Array.isArray(value.owners) || typeof value.address !== 'string' || !['awaiting-wallet', 'submitted'].includes(value.phase)) throw Error(); return value; } catch { throw new Error('Pending deployment record is invalid. Preserve it and reconcile before creating another vault.'); }
}
export async function deploySafe(name: string, creatorId: string, additionalOwners: string[]): Promise<PendingSafe> {
 if (!navigator.locks) throw new Error('This browser does not support safe deployment coordination.');
 return navigator.locks.request('tichori-safe-deployment', { ifAvailable: true }, async lock => {
 if (!lock) throw new Error('Another vault deployment is already in progress.');
 if (readPendingSafe()) throw new Error('A deployment is already pending. Resume or reconcile it before creating another vault.');
 const provider = window.ethereum;
 if (!provider) throw new Error('Connect an EVM wallet browser extension to create a Base Sepolia vault.');
 const accounts = await provider.request({ method: 'eth_requestAccounts' });
 if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw new Error('Choose a wallet account to create the vault.');
 const creator = getAddress(accounts[0]);
 const chain = Number(await provider.request({ method: 'eth_chainId' }));
 if (chain !== SAFE_CHAIN_ID) throw new Error('Switch your wallet to Base Sepolia and try again.');
 const owners = normalizeOwners([creator, ...additionalOwners]);
 const saltNonce = BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('')}`).toString();
 const kit = await prepareSafe(owners, saltNonce, provider);
 const address = getAddress(await kit.getAddress());
 const tx = await kit.createSafeDeploymentTransaction();
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
 const provider = window.ethereum;
 if (!provider || Number(await provider.request({ method: 'eth_chainId' })) !== SAFE_CHAIN_ID) throw new Error('Connect your wallet to Base Sepolia to check the deployment.');
 if (!pending.deploymentTxHash) throw new Error('The deployment hash is missing. Find it in your wallet and enter it to resume.');
 const reader = createPublicClient({ chain: baseSepolia, transport: custom(provider, { retryCount: 0 }) });
 const receipt = await reader.waitForTransactionReceipt({ hash: pending.deploymentTxHash, timeout: 90000, pollingInterval: 2000 });
 if (receipt.status !== 'success') throw new Error('The Safe deployment reverted. Reconcile the pending transaction before continuing.');
}
