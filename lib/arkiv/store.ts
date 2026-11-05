import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { ENTITY_EVENTS_ABI } from '@arkiv-network/sdk/entity';
import { defineSchema, bytes, str, u64 } from '@arkiv-network/sdk/schema';
import { eq } from '@arkiv-network/sdk/query';
import { http, custom, decodeFunctionData, decodeEventLog, parseAbi, keccak256, parseEther, type Hex } from 'viem';
import { estimateGas, getGasPrice, sendRawTransaction } from 'viem/actions';
import { privateKeyToAccount } from 'viem/accounts';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { emptyVault, VaultError, type Vault } from '../vault.ts';
import { encryptState, decryptState } from './codec.ts';

const State = defineSchema('tichori_state_v1', { namespace: str().indexed(), revision: u64(), encoding: str(), ciphertext: bytes() });
const registry = '0x4400000000000000000000000000000000000044' as const;
const executeAbi = parseAbi(['function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)']);
const encoding = 'tichori/aes-256-gcm/v1';
export class StorageError extends Error {}
function fail(message: string): never { throw new StorageError(message); }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Pending = { hash: Hex; raw: Hex; ciphertext: Hex; revision: string; nonce: number; gas: string; gasPrice: string; data: Hex; phase: 'signed' | 'receipt_confirmed'; entityKey?: Hex };
type Journal = { version: 1; signer: string; namespace: string; genesis: string; reservedWei: string; entityKey?: Hex; revision?: string; cipherHash?: string; lastTxHash?: Hex; lastFeeWei?: string; pending?: Pending };

export async function durableJson(path: string, value: unknown) {
 const temp = `${path}.${randomUUID()}.tmp`;
 const f = await open(temp, 'wx', 0o600);
 try { await f.writeFile(JSON.stringify(value)); await f.sync(); } finally { await f.close(); }
 await rename(temp, path);
 const parent = await open(join(path, '..'), 'r');
 try { await parent.sync(); } finally { await parent.close(); }
}
export function arkivConfig() {
 const accessKey = process.env.ARKIV_ACCESS_KEY;
 const rawKey = process.env.ARKIV_WALLET_PRIVATE_KEY?.trim();
 const privateKey = rawKey && /^[\da-f]{64}$/i.test(rawKey) ? `0x${rawKey}` : rawKey;
 const key = process.env.ARKIV_STATE_ENCRYPTION_KEY;
 const namespace = process.env.ARKIV_NAMESPACE || 'tichori-local-v1';
 if (!accessKey) fail('Configure ARKIV_ACCESS_KEY in your server environment.');
 if (!privateKey || !/^0x[\da-f]{64}$/i.test(privateKey)) fail('Configure a valid ARKIV_WALLET_PRIVATE_KEY on the server.');
 if (!key || !/^[\da-f]{64}$/i.test(key)) fail('Configure ARKIV_STATE_ENCRYPTION_KEY with 32 random bytes in hex.');
 if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) fail('Invalid ARKIV_NAMESPACE.');
 const account = privateKeyToAccount(privateKey as Hex);
 const expected = process.env.ARKIV_WALLET_ADDRESS || '0x66330597bD0a67B970CF32F003a70444CEB27c34';
 if (account.address.toLowerCase() !== expected.toLowerCase()) fail('Arkiv signer does not match ARKIV_WALLET_ADDRESS.');
 return { accessKey, account, key: Buffer.from(key, 'hex'), namespace, root: process.env.VAULT_DATA_DIR || join(process.cwd(), 'data') };
}

export async function withArkiv<T>(work: (store: Awaited<ReturnType<typeof openStore>>) => Promise<T>): Promise<T> {
 const config = arkivConfig();
 await mkdir(config.root, { recursive: true, mode: 0o700 });
 // One persistent, shared directory and exclusive signer are required across all processes.
 const lockPath = join(config.root, `arkiv-${config.account.address.toLowerCase()}.lock`);
 let lock;
 for (let i = 0; i < 100; i++) {
  try { lock = await open(lockPath, 'wx', 0o600); break; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 100)); }
 }
 if (!lock) fail('Arkiv writer is busy or stopped with a lock. Inspect the journal before removing a stale lock.');
 try { await lock.writeFile(String(process.pid)); return await work(await openStore(config)); }
 catch (e) { if (e instanceof StorageError || e instanceof VaultError) throw e; throw new StorageError('Arkiv storage failed. Check local configuration and the transaction journal; do not resend uncertain writes.'); }
 finally { await lock.close(); await unlink(lockPath); }
}

async function openStore(config: ReturnType<typeof arkivConfig>) {
 const { account, namespace, key } = config;
 const chain = rabdi({ accessKey: config.accessKey });
 const reader = createPublicClient({ chain, cacheTime: 0, pollingInterval: 1000, transport: http(undefined, { timeout: 15000, retryCount: 0, fetchOptions: { cache: 'no-store', redirect: 'error' } }) });
 if (await reader.getChainId() !== 7794095) fail('Expected Arkiv Rabdi chain 7794095.');
 const genesis = (await reader.getBlock({ blockNumber: 0n })).hash!;
 const context = `7794095:${genesis}:${account.address.toLowerCase()}:${namespace}:1`;
 const path = join(config.root, `arkiv-${account.address.toLowerCase()}-${namespace}.json`);
 let journal: Journal;
 try { journal = JSON.parse(await readFile(path, 'utf8')); }
 catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') fail('Cannot read Arkiv journal.'); journal = { version: 1, signer: account.address, namespace, genesis, reservedWei: '0' }; }
 if (journal.version !== 1 || journal.signer !== account.address || journal.namespace !== namespace || journal.genesis !== genesis || !/^\d+$/.test(journal.reservedWei)) fail('Arkiv journal/network identity mismatch. Reconcile before continuing.');
 const save = () => durableJson(path, journal);
 const query = async () => {
  const page = await reader.select({ $key: true, $owner: true, $creator: true, $expiresAt: true, namespace: true, revision: true, encoding: true, ciphertext: true })
   .from(State, { onMismatch: 'throw' }).createdBy(account.address).ownedBy(account.address).where(eq('namespace', namespace)).limit(2).fetch();
  if (page.entities.length > 1) fail('Multiple Arkiv state entities found. Reconcile duplicates before continuing.');
  const row = page.entities[0];
  if (!row && journal.entityKey) fail('Arkiv state is missing, expired or transferred. Restore explicitly; it will not be reset automatically.');
  if (row && journal.entityKey && row.$key !== journal.entityKey) fail('Arkiv state entity changed unexpectedly.');
  if (row && row.encoding.value !== encoding) fail('Unsupported Arkiv encryption format.');
  return row;
 };
 const reconcile = async () => {
  const p = journal.pending;
  if (!p) return;
  // A known signed hash is never resent, even if its receipt is unavailable.
  const receipt = await reader.getTransactionReceipt({ hash: p.hash });
  if (receipt.status !== 'success') fail('Arkiv write reverted. Inspect the journal; automatic retries are disabled.');
  const tx = await reader.getTransaction({ hash: p.hash });
  if (tx.from.toLowerCase() !== account.address.toLowerCase() || tx.to?.toLowerCase() !== registry || tx.input !== p.data || tx.nonce !== p.nonce || tx.gas !== BigInt(p.gas) || tx.gasPrice !== BigInt(p.gasPrice) || tx.chainId !== 7794095 || tx.value !== 0n || keccak256(p.raw) !== p.hash) fail('Arkiv transaction differs from the journal.');
  if (!p.entityKey) {
   for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registry) continue;
    try { const event = decodeEventLog({ abi: ENTITY_EVENTS_ABI, data: log.data, topics: log.topics }); if (event.eventName === 'EntityCreated' && event.args.owner.toLowerCase() === account.address.toLowerCase()) p.entityKey = event.args.entityKey; } catch { /* unrelated log */ }
   }
  }
  if (!p.entityKey) fail('Confirmed write has no matching entity key. Reconcile without resending.');
  p.phase = 'receipt_confirmed'; journal.lastTxHash = p.hash; journal.lastFeeWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString(); await save();
  let matched = false;
  for (let i = 0; i < 5; i++) {
   const row = await query();
   if (row?.$key === p.entityKey && row.revision.value === BigInt(p.revision) && row.ciphertext.value === p.ciphertext) { decryptState(Buffer.from(p.ciphertext.slice(2), 'hex'), key, context); matched = true; break; }
   await new Promise(r => setTimeout(r, 1000));
  }
  if (!matched) fail('Arkiv receipt confirmed, but state readback did not match. Reconcile without resending.');
  journal.entityKey = p.entityKey; journal.revision = p.revision; journal.cipherHash = digest(p.ciphertext); delete journal.pending; await save();
 };
 await reconcile();
 const read = async () => {
  const row = await query();
  if (!row) return { vault: emptyVault(), revision: 0n, entityKey: undefined };
  if (journal.revision && (row.revision.value !== BigInt(journal.revision) || digest(row.ciphertext.value) !== journal.cipherHash)) fail('Arkiv state differs from the verified journal.');
  const vault = decryptState(Buffer.from(row.ciphertext.value.slice(2), 'hex'), key, context);
  if (!journal.entityKey) { journal.entityKey = row.$key; journal.revision = row.revision.value.toString(); journal.cipherHash = digest(row.ciphertext.value); await save(); }
  return { vault, revision: row.revision.value, entityKey: row.$key };
 };
 const write = async (vault: Vault, previous: Awaited<ReturnType<typeof read>>) => {
  const cap = process.env.ARKIV_MAX_TOTAL_FEE_TGLM;
  if (!cap || !/^\d+(\.\d{1,18})?$/.test(cap) || parseEther(cap) <= 0n) fail('Set an approved ARKIV_MAX_TOTAL_FEE_TGLM before enabling writes.');
  const ciphertext = `0x${encryptState(vault, key, context).toString('hex')}` as Hex;
  const revision = previous.revision + 1n;
  const values = { namespace, revision: u64(revision), encoding, ciphertext: Buffer.from(ciphertext.slice(2), 'hex') };
  let attempted = false;
  const wallet = createWalletClient({ chain, account: account.address, cacheTime: 0, pollingInterval: 1000, transport: custom({ request: async ({ method, params }) => {
   if (method !== 'eth_sendTransaction') return reader.request({ method, params } as Parameters<typeof reader.request>[0]);
   if (attempted) fail('Only one submission per write is allowed.'); attempted = true;
   const input = (params as [{ to: Hex; data: Hex }])[0];
   if (input.to.toLowerCase() !== registry) fail('Unexpected Arkiv recipient.');
   const decoded = decodeFunctionData({ abi: executeAbi, data: input.data });
   if (decoded.args[0].length !== 1 || decoded.args[0][0].operation !== (previous.entityKey ? 2 : 1)) fail('Unexpected Arkiv operation.');
   if (await reader.getChainId() !== 7794095) fail('Wrong signing network.');
   const call = { account: account.address, to: registry, data: input.data, value: 0n };
   const estimate = await estimateGas(reader, { ...call, blockTag: 'latest' });
   const gas = estimate * 2n > 1_000_000n ? estimate * 2n : 1_000_000n;
   const head = await reader.getBlock({ blockTag: 'latest' });
   const nonce = await reader.getTransactionCount({ address: account.address, blockTag: 'latest' });
   const gasPrice = await getGasPrice(reader), maximum = gas * gasPrice;
   if (estimate <= 0n || gas > head.gasLimit / 2n) fail('Arkiv gas estimate exceeds the safe block budget.');
   if (maximum + BigInt(journal.reservedWei) > parseEther(cap)) fail('Approved cumulative Arkiv fee budget is exhausted.');
   if (await reader.getBalance({ address: account.address, blockTag: 'latest' }) < maximum) fail('Insufficient test GLM for the estimated Arkiv fee.');
   if (await reader.getTransactionCount({ address: account.address, blockTag: 'pending' }) !== nonce) fail('Resolve other pending wallet transactions before writing.');
   // Recheck the quote immediately before signing. No other app may use this signer.
   const freshEstimate = await estimateGas(reader, { ...call, blockTag: 'latest' });
   const freshHead = await reader.getBlock({ blockTag: 'latest' });
   if (gas < freshEstimate * 2n || gas > freshHead.gasLimit / 2n || await getGasPrice(reader) !== gasPrice || await reader.getTransactionCount({ address: account.address, blockTag: 'latest' }) !== nonce) fail('Arkiv quote changed. No transaction was signed.');
   const raw = await account.signTransaction({ chainId: 7794095, type: 'legacy', to: registry, data: input.data, value: 0n, gas, gasPrice, nonce });
   const hash = keccak256(raw);
   journal.reservedWei = (BigInt(journal.reservedWei) + maximum).toString();
   journal.pending = { hash, raw, ciphertext, revision: revision.toString(), nonce, gas: gas.toString(), gasPrice: gasPrice.toString(), data: input.data, phase: 'signed', entityKey: previous.entityKey };
   await save(); // Fsync signed intent BEFORE forwarding to RPC. Never log raw bytes.
   const returned = await sendRawTransaction(reader, { serializedTransaction: raw });
   if (returned !== hash) fail('RPC returned an unexpected hash. Inspect the journal.');
   return hash;
  } }, { retryCount: 0 }) });
  try {
   // Explicit gas avoids the SDK's default estimator; the transport estimates the exact encoded operation.
   if (previous.entityKey) await wallet.patchEntity(State, previous.entityKey, { set: values }, { gas: 1_000_000n });
   else await wallet.createEntity(State, values, { expiration: ExpirationTime.fromDays(30) }, { gas: 1_000_000n });
   await reconcile();
  } catch (e) { if (e instanceof StorageError) throw e; fail(journal.pending ? 'Arkiv write requires reconciliation. Its signed hash is saved locally; do not submit it again.' : 'Arkiv write preparation failed; no transaction was broadcast.'); }
 };
 return { read, write, reader, address: account.address, journal: () => ({ entityKey: journal.entityKey, revision: journal.revision, reservedWei: journal.reservedWei, lastTxHash: journal.lastTxHash, lastFeeWei: journal.lastFeeWei, pendingHash: journal.pending?.hash }) };
}
