import type { StorageAdapter, TijoriEvent, TijoriProviders } from './context.ts';

/**
 * Configuration for createTijoriServer(). Every field is optional so you can start from fromEnv() and override.
 * Secrets stay server-side: never expose them through NEXT_PUBLIC_* or client bundles.
 */
export type TijoriServerConfig = {
 /** Path prefix the handler is mounted at, e.g. '/api/tijori'. Requests are routed on the remainder. */
 basePath?: string;
 /** Public invoice receipt page, with `{id}` replaced by the invoice ID. Default '/invoice/{id}'. */
 receiptPath?: string;
 /** 'arkiv' (default), 'local' (encrypted file on disk) or a custom StorageAdapter (e.g. memoryStorage()). */
 storage?: 'arkiv' | 'local' | StorageAdapter;
 /** Persistent data directory for journals and locks (must be shared by every process using the same keys). */
 dataDir?: string;
 arkiv?: { accessKey?: string; walletPrivateKey?: string; walletAddress?: string; stateEncryptionKey?: string; namespace?: string; maxTotalFeeTglm?: string };
 /** Directory for 'local' storage. Defaults to <cwd>/data/local-demo. */
 localDataDir?: string;
 whitechain?: {
  rpcUrl?: string; relayerPrivateKey?: string; verifierPrivateKey?: string; guardAddress?: string; safeSetupAddress?: string;
  /** Rehearsal-only token override. Payments in it do not qualify as Whitechain USDT payments. */
  rehearsalTokenAddress?: string;
  gasRefundMicroUsdtPerGas?: number; baseGas?: number; maxFeeGwei?: number; minRelayerBalanceMilliWbt?: number;
  dailyVaultDeploys?: number; dailyExecutionsPerVault?: number; approvalSessionSeconds?: number;
 };
 /** 32-byte hex secret for vendor inbox keys and webhook secrets (defaults to one derived from the Arkiv key). */
 apiMasterKey?: string;
 webhooks?: { allowPrivateNetworks?: boolean };
 /** Replace any verification provider (object matching, presence, physical approval, external vault). */
 providers?: Partial<TijoriProviders>;
 /** Keep background work (webhook delivery) alive after the response. Next.js adapter passes `after`. */
 waitUntil?: (work: Promise<unknown>) => void;
 /** Domain events after successful writes. Errors thrown here are logged and ignored. */
 onEvent?: (event: TijoriEvent) => void | Promise<void>;
 /** Raw settings by environment-variable name; structured fields above take precedence. */
 env?: Record<string, string | undefined>;
};

const str = (value: string | number | boolean | undefined) => value === undefined ? undefined : String(value);
/** Flatten a config into the setting names the server modules read. */
export function toSettings(config: TijoriServerConfig): Record<string, string | undefined> {
 const w = config.whitechain ?? {}, a = config.arkiv ?? {};
 const structured: Record<string, string | undefined> = {
  TIJORI_STORAGE_MODE: typeof config.storage === 'string' ? config.storage : undefined,
  TIJORI_BASE_PATH: config.basePath, TIJORI_RECEIPT_PATH: config.receiptPath,
  VAULT_DATA_DIR: config.dataDir, LOCAL_DEMO_DATA_DIR: config.localDataDir,
  ARKIV_ACCESS_KEY: a.accessKey, ARKIV_WALLET_PRIVATE_KEY: a.walletPrivateKey, ARKIV_WALLET_ADDRESS: a.walletAddress,
  ARKIV_STATE_ENCRYPTION_KEY: a.stateEncryptionKey, ARKIV_NAMESPACE: a.namespace, ARKIV_MAX_TOTAL_FEE_TGLM: a.maxTotalFeeTglm,
  WHITECHAIN_RPC_URL: w.rpcUrl, WHITECHAIN_RELAYER_PRIVATE_KEY: w.relayerPrivateKey, TIJORI_VERIFIER_PRIVATE_KEY: w.verifierPrivateKey,
  TIJORI_GUARD_ADDRESS: w.guardAddress, TIJORI_SAFE_SETUP_ADDRESS: w.safeSetupAddress, TIJORI_REHEARSAL_TOKEN_ADDRESS: w.rehearsalTokenAddress,
  TREASURY_GAS_PRICE_MICRO_USDT: str(w.gasRefundMicroUsdtPerGas), TREASURY_BASE_GAS: str(w.baseGas), RELAYER_MAX_FEE_GWEI: str(w.maxFeeGwei),
  RELAYER_MIN_BALANCE_MILLI_WBT: str(w.minRelayerBalanceMilliWbt), RELAYER_DAILY_VAULT_DEPLOYS: str(w.dailyVaultDeploys),
  RELAYER_DAILY_EXECUTIONS_PER_VAULT: str(w.dailyExecutionsPerVault), APPROVAL_SESSION_SECONDS: str(w.approvalSessionSeconds),
  TIJORI_API_MASTER_KEY: config.apiMasterKey, TIJORI_WEBHOOK_ALLOW_PRIVATE: config.webhooks?.allowPrivateNetworks === undefined ? undefined : config.webhooks.allowPrivateNetworks ? '1' : '0',
 };
 const settings: Record<string, string | undefined> = { ...(config.env ?? {}) };
 for (const [key, value] of Object.entries(structured)) if (value !== undefined) settings[key] = value;
 return settings;
}

/**
 * Build a config from environment variables (default: process.env). Reads the documented names; TIJORI_* names win
 * over the legacy TICHORI_* names, which keep working with a deprecation warning.
 */
export function fromEnv(env: Record<string, string | undefined> = process.env): TijoriServerConfig {
 const settings: Record<string, string | undefined> = {};
 for (const [key, value] of Object.entries(env)) settings[key] = value;
 for (const [key, value] of Object.entries(env)) {
  if (!key.startsWith('TICHORI_')) continue;
  const modern = 'TIJORI_' + key.slice('TICHORI_'.length);
  if (settings[modern] === undefined) { settings[modern] = value; console.warn(`[tijori] ${key} is deprecated; rename it to ${modern}.`); }
 }
 return { env: settings };
}
