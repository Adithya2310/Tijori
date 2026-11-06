import 'server-only';
import { createPublicClient, getAddress, http, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { whitechainSepolia } from 'viem/chains';
import { join } from 'node:path';
import { IntegrationUnavailableError } from '../integrations/contracts.ts';
import { WHITECHAIN_CHAIN_ID, WHITECHAIN_DEFAULT_RPC, WHITECHAIN_USDT } from './chain.ts';

/** Server-only Whitechain configuration. Read at request time so one build can target any RPC. */
export function whitechainRpcUrl() {
 return process.env.WHITECHAIN_RPC_URL?.trim() || WHITECHAIN_DEFAULT_RPC;
}
const clients = new Map<string, ReturnType<typeof makeClient>>();
function makeClient(url: string) {
 return createPublicClient({ chain: whitechainSepolia, transport: http(url, { timeout: 20_000, retryCount: 1 }) });
}
export function whitechainClient() {
 const url = whitechainRpcUrl();
 let client = clients.get(url);
 if (!client) { client = makeClient(url); clients.set(url, client); }
 return client;
}
/**
 * The treasury asset. Always the hackathon USDT unless a rehearsal override is set explicitly.
 * Payments in a self-minted token do NOT count for Whitechain qualification; the override exists
 * only to rehearse the full flow on Whitechain Sepolia while waiting for real test USDT.
 */
export function usdtAddress() {
 const override = process.env.TICHORI_REHEARSAL_TOKEN_ADDRESS?.trim();
 if (!override) return WHITECHAIN_USDT;
 if (!isAddress(override)) throw new IntegrationUnavailableError('TICHORI_REHEARSAL_TOKEN_ADDRESS is not a valid address.');
 return getAddress(override);
}
export const isRehearsalToken = () => usdtAddress() !== WHITECHAIN_USDT;
export async function assertWhitechain(client = whitechainClient()) {
 if (await client.getChainId() !== WHITECHAIN_CHAIN_ID) throw new Error('The Whitechain RPC is not on Whitechain Sepolia (1874).');
}

function key(name: string) {
 const raw = process.env[name]?.trim();
 const value = raw && /^[\da-f]{64}$/i.test(raw) ? `0x${raw}` : raw;
 if (!value || !/^0x[\da-f]{64}$/i.test(value)) return null;
 return privateKeyToAccount(value as Hex);
}
function address(name: string) {
 const value = process.env[name]?.trim();
 return value && isAddress(value) ? getAddress(value) : null;
}
function positiveInt(name: string, fallback: number) {
 const value = Number(process.env[name] ?? fallback);
 return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

/** Treasury execution config. Missing pieces make the feature report 501, never a silent fallback. */
export function treasuryConfig() {
 const relayer = key('WHITECHAIN_RELAYER_PRIVATE_KEY');
 const verifier = key('TICHORI_VERIFIER_PRIVATE_KEY');
 const guard = address('TICHORI_GUARD_ADDRESS');
 const setup = address('TICHORI_SAFE_SETUP_ADDRESS');
 const missing = [!relayer && 'WHITECHAIN_RELAYER_PRIVATE_KEY', !verifier && 'TICHORI_VERIFIER_PRIVATE_KEY', !guard && 'TICHORI_GUARD_ADDRESS', !setup && 'TICHORI_SAFE_SETUP_ADDRESS'].filter(Boolean);
 if (missing.length) throw new IntegrationUnavailableError(`Whitechain treasury is not configured. Set ${missing.join(', ')}.`);
 if (relayer!.address === verifier!.address) throw new IntegrationUnavailableError('Use separate relayer and verifier keys.');
 return {
  relayer: relayer!, verifier: verifier!, guard: guard!, setup: setup!,
  dataDir: join(process.env.VAULT_DATA_DIR || join(process.cwd(), 'data'), 'whitechain'),
  /** Micro-USDT per gas unit the vault refunds to the relayer (Safe native gas refund). 0 disables. */
  gasPriceMicroUsdt: BigInt(positiveInt('TREASURY_GAS_PRICE_MICRO_USDT', 1)),
  baseGas: BigInt(positiveInt('TREASURY_BASE_GAS', 80_000)),
  maxFeeGwei: positiveInt('RELAYER_MAX_FEE_GWEI', 20),
  minRelayerWei: BigInt(positiveInt('RELAYER_MIN_BALANCE_MILLI_WBT', 5)) * 10n ** 15n,
  dailyDeployCap: positiveInt('RELAYER_DAILY_VAULT_DEPLOYS', 20),
  dailyExecutionCapPerVault: positiveInt('RELAYER_DAILY_EXECUTIONS_PER_VAULT', 25),
  sessionSeconds: positiveInt('APPROVAL_SESSION_SECONDS', 120),
 };
}
export function isTreasuryConfigured() {
 try { treasuryConfig(); return true; } catch { return false; }
}
