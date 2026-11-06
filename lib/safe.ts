import Safe from '@safe-global/protocol-kit';
import { createPublicClient, decodeEventLog, decodeFunctionData, getAddress, http, isAddress, parseAbi, zeroAddress, type Hex } from 'viem';
import { getProxyFactoryDeployment, getSafeL2SingletonDeployment, getCompatibilityFallbackHandlerDeployment } from '@safe-global/safe-deployments';
import { baseSepolia } from 'viem/chains';

export const SAFE_CHAIN_ID = 84532;
export const SAFE_VERSION = '1.4.1' as const;
export const SAFE_RPC = 'https://sepolia.base.org';
const factoryAbi = parseAbi(['function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)', 'event ProxyCreation(address indexed proxy, address singleton)']);
const setupAbi = parseAbi(['function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)']);
// chainId 84532 = legacy Base Sepolia vaults (MetaMask-deployed). 1874 = guarded Whitechain Sepolia vaults (see lib/whitechain).
import type { SafeRecord } from '@tijori/core/types';
export type { SafeRecord };

export function normalizeOwners(input: unknown): `0x${string}`[] {
 if (!Array.isArray(input) || input.length < 2 || input.length > 32) throw new Error('A vault requires between 2 and 32 signer addresses.');
 const owners = input.map(value => {
  if (typeof value !== 'string' || !isAddress(value, { strict: true }) || /^0x0{39}[01]$/i.test(value)) throw new Error('Enter valid wallet addresses for all vault signers.');
  return getAddress(value);
 });
 if (new Set(owners.map(address => address.toLowerCase())).size !== owners.length) throw new Error('Each vault signer address must be unique.');
 return owners;
}
export function validateSalt(value: unknown): string {
 if (typeof value !== 'string' || !/^(0|[1-9]\d{0,76})$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error('Invalid Safe deployment salt.');
 return value;
}
export async function prepareSafe(owners: `0x${string}`[], saltNonce: string, provider: string | { request: (args: { method: string; params?: readonly unknown[] | object }) => Promise<unknown> } = SAFE_RPC) {
 return Safe.init({ provider, predictedSafe: { safeAccountConfig: { owners, threshold: Math.floor(owners.length / 2) + 1 }, safeDeploymentConfig: { saltNonce, safeVersion: SAFE_VERSION } } });
}
export async function verifySafeDeployment(input: { owners: unknown; saltNonce: unknown; address: unknown; deploymentTxHash: unknown }, rpcUrl = SAFE_RPC): Promise<SafeRecord> {
 const owners = normalizeOwners(input.owners), saltNonce = validateSalt(input.saltNonce);
 if (typeof input.address !== 'string' || !isAddress(input.address)) throw new Error('Invalid Safe address.');
 if (typeof input.deploymentTxHash !== 'string' || !/^0x[\da-f]{64}$/i.test(input.deploymentTxHash)) throw new Error('A valid deployment transaction hash is required.');
 const deploymentTxHash = input.deploymentTxHash as Hex, address = getAddress(input.address);
 const reader = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }) });
 if (await reader.getChainId() !== SAFE_CHAIN_ID) throw new Error('Could not verify Base Sepolia network.');
 const predicted = await prepareSafe(owners, saltNonce, rpcUrl);
 if (getAddress(await predicted.getAddress()) !== address) throw new Error('Safe address does not match the requested owners and threshold.');
 const filter = { version: SAFE_VERSION, network: String(SAFE_CHAIN_ID) };
 const factory = getProxyFactoryDeployment(filter)?.networkAddresses[String(SAFE_CHAIN_ID)];
 const singleton = getSafeL2SingletonDeployment(filter)?.networkAddresses[String(SAFE_CHAIN_ID)];
 const handler = getCompatibilityFallbackHandlerDeployment(filter)?.networkAddresses[String(SAFE_CHAIN_ID)];
 if (!factory || !singleton || !handler) throw new Error('Official Safe deployment configuration is unavailable.');
 const [tx, receipt] = await Promise.all([reader.getTransaction({ hash: deploymentTxHash }), reader.getTransactionReceipt({ hash: deploymentTxHash })]);
 if (receipt.status !== 'success' || !tx.to || getAddress(tx.to) !== getAddress(factory) || tx.value !== 0n || getAddress(tx.from) !== owners[0]) throw new Error('Deployment transaction does not match the requested Safe.');
 const call = decodeFunctionData({ abi: factoryAbi, data: tx.input });
 if (call.functionName !== 'createProxyWithNonce') throw new Error('Unexpected Safe factory operation.');
 const [target, initializer, salt] = call.args;
 const setup = decodeFunctionData({ abi: setupAbi, data: initializer });
 const [setupOwners, setupThreshold, to, data, fallbackHandler, paymentToken, payment, paymentReceiver] = setup.args;
 if (getAddress(target) !== getAddress(singleton) || salt !== BigInt(saltNonce) || setupOwners.length !== owners.length || setupOwners.some((owner, i) => getAddress(owner) !== owners[i]) || setupThreshold !== BigInt(Math.floor(owners.length / 2) + 1) || getAddress(to) !== zeroAddress || data !== '0x' || getAddress(fallbackHandler) !== getAddress(handler) || getAddress(paymentToken) !== zeroAddress || payment !== 0n || getAddress(paymentReceiver) !== zeroAddress) throw new Error('Safe initialization does not match the requested configuration.');
 const created = receipt.logs.some(log => {
  if (getAddress(log.address) !== getAddress(factory)) return false;
  try { const event = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }); return event.eventName === 'ProxyCreation' && getAddress(event.args.proxy) === address && getAddress(event.args.singleton) === getAddress(singleton); } catch { return false; }
 });
 if (!created) throw new Error('Safe creation event is missing from the deployment receipt.');
 const safe = await Safe.init({ provider: rpcUrl, safeAddress: address });
 if (!(await safe.isSafeDeployed())) throw new Error('Safe is not deployed.');
 const [onchainOwners, onchainThreshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
 if (onchainThreshold !== Math.floor(owners.length / 2) + 1 || onchainOwners.length !== owners.length || onchainOwners.some(owner => !owners.some(expected => expected.toLowerCase() === owner.toLowerCase()))) throw new Error('Safe owners or threshold differ from the requested configuration.');
 return { address, chainId: SAFE_CHAIN_ID, owners, threshold: onchainThreshold, deploymentTxHash, saltNonce };
}

export async function readSafeStatus(address: `0x${string}`) {
 const reader = createPublicClient({ chain: baseSepolia, transport: http(SAFE_RPC, { timeout: 15000, retryCount: 0 }) });
 if (await reader.getChainId() !== SAFE_CHAIN_ID) throw new Error('Could not verify Base Sepolia network.');
 const safe = await Safe.init({ provider: SAFE_RPC, safeAddress: address });
 if (!(await safe.isSafeDeployed())) throw new Error('Safe is not deployed.');
 const [balance, owners, threshold] = await Promise.all([reader.getBalance({ address, blockTag: 'latest' }), safe.getOwners(), safe.getThreshold()]);
 return { address, chainId: SAFE_CHAIN_ID, balanceWei: balance.toString(), owners: owners.map(getAddress), threshold };
}
