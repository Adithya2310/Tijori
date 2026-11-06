import 'server-only';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { decodeEventLog, encodeFunctionData, getAddress, keccak256, type Address, type Hex, type TransactionReceipt } from 'viem';
import { durableJson } from '../arkiv/store.ts';
import { StorageError } from '../db.ts';
import { VaultError } from '@tijori/core/vault';
import { SAFE_141, SAFE_GUARD_SLOT, WHITECHAIN_CHAIN_ID } from '@tijori/core/whitechain/chain';
import { assertWhitechain, treasuryConfig, whitechainClient } from './config.ts';
import { factoryAbi, guardAbi, guardedInitializer, majority, predictSafeAddress, safeAbi } from '@tijori/core/whitechain/safe-tx';

export type SessionApproval = { walletId: string; address: Address; signature: Hex; at: string; objectMode: string; presenceMode: string };
export type Session = {
 id: string; proposalId: string; vaultId: string; safe: Address; threshold: number; owners: Address[]; initiatorId: string;
 safeTx: { to: Address; value: string; data: Hex; operation: 0; safeTxGas: string; baseGas: string; gasPrice: string; gasToken: Address; refundReceiver: Address; nonce: string };
 safeTxHash: Hex; challenge: { challengeId: string; code: string; expiresAt: string }; presence: { provider: string; mode: string };
 createdAt: string; expiresAt: string; approvals: SessionApproval[];
 status: 'open' | 'executing' | 'submitted' | 'executed' | 'failed' | 'expired' | 'superseded';
 txHash?: Hex; gasRefund?: string; recorded?: boolean; error?: string;
};
type PendingTx = { hash: Hex; nonce: number; purpose: 'deploy' | 'execute'; ref: string; sentAt: string };
type Deploy = { owners: Address[]; saltNonce: string; address: Address; status: 'prepared' | 'sent' | 'deployed'; txHash?: Hex };
export type TreasuryJournal = {
 version: 1; relayer: Address; chainId: number;
 pending?: PendingTx; sent: number; gasWei: string; refundsMicroUsdt: string;
 /** Confirmed relayer transactions by reference (deploy opId or session ID), so no receipt is ever lost. */
 confirmed?: Record<string, { hash: Hex; purpose: PendingTx['purpose']; at: string }>;
 daily: Record<string, number>; deploys: Record<string, Deploy>; sessions: Record<string, Session>;
};

const day = () => new Date().toISOString().slice(0, 10);
export function bumpDaily(journal: TreasuryJournal, key: string, cap: number, message: string) {
 const id = `${day()}:${key}`;
 if ((journal.daily[id] ?? 0) >= cap) throw new VaultError(message);
 journal.daily[id] = (journal.daily[id] ?? 0) + 1;
 for (const k of Object.keys(journal.daily)) if (!k.startsWith(day())) delete journal.daily[k];
}

// One writer per data directory and relayer key, serialized across processes with an exclusive lock file.
let chain: Promise<unknown> = Promise.resolve();
export async function withTreasury<T>(work: (ctx: { journal: TreasuryJournal; save: () => Promise<void>; config: ReturnType<typeof treasuryConfig> }) => Promise<T>): Promise<T> {
 const run = chain.then(() => locked(work), () => locked(work));
 chain = run.catch(() => undefined);
 return run;
}
async function locked<T>(work: Parameters<typeof withTreasury<T>>[0]): Promise<T> {
 const config = treasuryConfig();
 await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
 const lockPath = join(config.dataDir, `treasury-${config.relayer.address.toLowerCase()}.lock`);
 let lock;
 for (let i = 0; i < 300; i++) {
  try { lock = await open(lockPath, 'wx', 0o600); break; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 100)); }
 }
 if (!lock) throw new StorageError('The Whitechain relayer is busy or stopped with a lock. Inspect the treasury journal before removing a stale lock.');
 const path = join(config.dataDir, `treasury-${config.relayer.address.toLowerCase()}.json`);
 try {
  await lock.writeFile(String(process.pid));
  let journal: TreasuryJournal;
  try { journal = JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new StorageError('Cannot read the treasury journal.'); journal = { version: 1, relayer: config.relayer.address, chainId: WHITECHAIN_CHAIN_ID, sent: 0, gasWei: '0', refundsMicroUsdt: '0', daily: {}, deploys: {}, sessions: {} }; }
  if (journal.version !== 1 || journal.relayer !== config.relayer.address || journal.chainId !== WHITECHAIN_CHAIN_ID) throw new StorageError('Treasury journal does not match this relayer. Reconcile before continuing.');
  const save = () => durableJson(path, journal);
  return await work({ journal, save, config });
 } finally { await lock.close(); await unlink(lockPath); }
}

function markConfirmed(journal: TreasuryJournal, pending: PendingTx) {
 const confirmed = journal.confirmed ??= {};
 confirmed[pending.ref] = { hash: pending.hash, purpose: pending.purpose, at: new Date().toISOString() };
 for (const [ref, entry] of Object.entries(confirmed)) if (Date.now() - Date.parse(entry.at) > 7 * 86_400_000) delete confirmed[ref];
}
/** Resolve a previously signed transaction. Never resends it. Returns its receipt, or null if still pending. */
export async function reconcilePending(journal: TreasuryJournal, save: () => Promise<void>) {
 const pending = journal.pending;
 if (!pending) return null;
 const client = whitechainClient();
 const receipt = await client.getTransactionReceipt({ hash: pending.hash }).catch(() => null);
 if (!receipt) {
  const latest = await client.getTransactionCount({ address: journal.relayer, blockTag: 'latest' });
  if (latest > pending.nonce) throw new StorageError('A relayer transaction was replaced or dropped. Inspect the treasury journal; it will not be resent automatically.');
  // Unknown to the node long after sending and its nonce is unused: it was dropped, so the nonce is free again.
  const known = await client.getTransaction({ hash: pending.hash }).catch(() => null);
  if (!known && Date.now() - Date.parse(pending.sentAt) > 120_000) { delete journal.pending; await save(); }
  return null;
 }
 journal.sent += 1; journal.gasWei = (BigInt(journal.gasWei) + receipt.gasUsed * receipt.effectiveGasPrice).toString();
 markConfirmed(journal, pending); delete journal.pending; await save();
 return receipt;
}

/** Simulate, sign, journal (fsync) and broadcast one relayer transaction, then wait for its receipt. */
export async function relay(ctx: { journal: TreasuryJournal; save: () => Promise<void>; config: ReturnType<typeof treasuryConfig> }, tx: { to: Address; data: Hex; purpose: PendingTx['purpose']; ref: string }): Promise<TransactionReceipt> {
 const { journal, save, config } = ctx;
 if (journal.pending && !(await reconcilePending(journal, save))) throw new StorageError('The relayer has an unconfirmed transaction. Try again shortly; it will not be resent.');
 const client = whitechainClient();
 await assertWhitechain(client);
 const account = config.relayer;
 const [balance, block, nonce, pendingNonce] = await Promise.all([client.getBalance({ address: account.address }), client.getBlock({ blockTag: 'latest' }), client.getTransactionCount({ address: account.address, blockTag: 'latest' }), client.getTransactionCount({ address: account.address, blockTag: 'pending' })]);
 if (balance < config.minRelayerWei) throw new StorageError('The relayer gas tank is low. Top it up with WBT before relaying.');
 if (pendingNonce !== nonce) throw new StorageError('The relayer account has transactions pending outside Tichori. Resolve them first.');
 // Estimation doubles as simulation: a reverting call costs the relayer nothing.
 let estimate: bigint;
 try { estimate = await client.estimateGas({ account: account.address, to: tx.to, data: tx.data, value: 0n }); }
 catch { throw new VaultError('The transaction would fail on Whitechain, so it was not sent.'); }
 const gas = estimate * 125n / 100n + 20_000n;
 if (gas > 3_000_000n) throw new VaultError('The transaction needs more gas than the relayer allows.');
 const tip = 1_000_000n, baseFee = block.baseFeePerGas ?? 5_000_000_000n, cap = BigInt(config.maxFeeGwei) * 1_000_000_000n;
 const maxFeePerGas = baseFee * 2n + tip < cap ? baseFee * 2n + tip : cap;
 if (maxFeePerGas <= baseFee) throw new StorageError('Whitechain fees are above the relayer cap right now.');
 if (gas * maxFeePerGas > balance) throw new StorageError('The relayer gas tank cannot cover this transaction.');
 const raw = await account.signTransaction({ chainId: WHITECHAIN_CHAIN_ID, type: 'eip1559', to: tx.to, data: tx.data, value: 0n, gas, maxFeePerGas, maxPriorityFeePerGas: tip, nonce });
 const hash = keccak256(raw);
 journal.pending = { hash, nonce, purpose: tx.purpose, ref: tx.ref, sentAt: new Date().toISOString() };
 await save(); // Signed intent is durable before it reaches the network.
 try { await client.sendRawTransaction({ serializedTransaction: raw }); }
 catch {
  // The send may still have reached the node. Only a transaction the node does not know is cleared.
  if (!(await client.getTransaction({ hash }).catch(() => null))) { delete journal.pending; await save(); throw new StorageError('The Whitechain node rejected the relayer transaction. Nothing was sent.'); }
 }
 const receipt = await client.waitForTransactionReceipt({ hash, timeout: 30_000, pollingInterval: 500 }).catch(() => null);
 if (!receipt) throw new StorageError('The relayer transaction is not confirmed yet. It is saved and will be reconciled, never resent.');
 journal.sent += 1; journal.gasWei = (BigInt(journal.gasWei) + receipt.gasUsed * receipt.effectiveGasPrice).toString();
 markConfirmed(journal, journal.pending!); delete journal.pending; await save();
 return receipt;
}

/** Gasless creation of a guarded majority Safe. `opId` makes retries resume the same deployment. */
export async function deployGuardedSafe(opId: string, owners: Address[]) {
 return withTreasury(async ctx => {
  const { journal, save, config } = ctx;
  const client = whitechainClient();
  await assertWhitechain(client);
  let deploy = journal.deploys[opId];
  const initializerFor = (list: Address[]) => guardedInitializer({ owners: list, setup: config.setup, guard: config.guard, verifier: config.verifier.address, fallbackHandler: SAFE_141.fallbackHandler });
  if (deploy && deploy.owners.join() !== owners.join()) throw new VaultError('This operation ID was already used for different vault signers.');
  if (!deploy) {
   bumpDaily(journal, 'deploys', config.dailyDeployCap, 'The daily vault creation limit for this relayer has been reached.');
   const proxyCreationCode = await client.readContract({ address: SAFE_141.factory, abi: factoryAbi, functionName: 'proxyCreationCode' });
   const saltNonce = BigInt('0x' + randomBytes(16).toString('hex'));
   const address = predictSafeAddress({ factory: SAFE_141.factory, singleton: SAFE_141.singletonL2, proxyCreationCode, initializer: initializerFor(owners), saltNonce });
   if (await client.getCode({ address })) throw new VaultError('The predicted vault address is already in use.');
   deploy = journal.deploys[opId] = { owners, saltNonce: saltNonce.toString(), address, status: 'prepared' };
   await save();
  }
  if (deploy.status !== 'deployed' && !(await client.getCode({ address: deploy.address }))) {
   if (journal.pending?.ref === opId && !(await reconcilePending(journal, save))) throw new StorageError('The vault deployment is not confirmed yet. Retry with the same operation to resume.');
   if (!(await client.getCode({ address: deploy.address }))) {
    deploy.status = 'sent'; await save();
    const data = encodeFunctionData({ abi: factoryAbi, functionName: 'createProxyWithNonce', args: [SAFE_141.singletonL2, initializerFor(owners), BigInt(deploy.saltNonce)] });
    const receipt = await relay(ctx, { to: SAFE_141.factory, data, purpose: 'deploy', ref: opId });
    if (receipt.status !== 'success') throw new VaultError('The vault deployment reverted.');
    const created = receipt.logs.some(log => { try { const e = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }); return e.eventName === 'ProxyCreation' && getAddress(e.args.proxy) === deploy!.address; } catch { return false; } });
    if (!created) throw new VaultError('The vault creation event is missing.');
    deploy.txHash = receipt.transactionHash;
   }
  }
  // Verify the live configuration before anything is recorded.
  const [onchainOwners, threshold, guardSlot, verifier] = await Promise.all([
   client.readContract({ address: deploy.address, abi: safeAbi, functionName: 'getOwners' }),
   client.readContract({ address: deploy.address, abi: safeAbi, functionName: 'getThreshold' }),
   client.getStorageAt({ address: deploy.address, slot: SAFE_GUARD_SLOT }),
   client.readContract({ address: config.guard, abi: guardAbi, functionName: 'verifier', args: [deploy.address] }),
  ]);
  const sameOwners = onchainOwners.length === owners.length && onchainOwners.every(o => owners.some(x => x.toLowerCase() === o.toLowerCase()));
  if (!sameOwners || Number(threshold) !== majority(owners.length) || !guardSlot || getAddress(`0x${guardSlot.slice(-40)}`) !== config.guard || getAddress(verifier) !== config.verifier.address) throw new VaultError('The deployed vault does not match the requested guarded configuration.');
  deploy.txHash ??= journal.confirmed?.[opId]?.hash; // confirmed by an earlier reconcile
  if (!deploy.txHash) throw new StorageError('The vault exists but its deployment transaction is unknown. Reconcile manually.');
  deploy.status = 'deployed'; await save();
  return { address: deploy.address, owners, threshold: Number(threshold), saltNonce: deploy.saltNonce, deploymentTxHash: deploy.txHash, guard: config.guard };
 });
}
