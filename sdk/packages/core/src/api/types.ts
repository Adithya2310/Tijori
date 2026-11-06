// Wire types for the Tijori HTTP API (/api/v1). @tijori/server's handlers are annotated with these types, and
// @tijori/client returns them, so the two cannot drift apart without a compile error.
import type { Address, Hex } from 'viem';
import type { applicationState } from './domain.ts';
import type { KeyEnvelope } from '../identity-key.ts';
import type { ObjectProfileV2 } from '../object-profile.ts';
import type { sessionView } from '../proximity.ts';
import type { invoiceView } from '../whitechain/domain.ts';
import type { Evidence, Verification } from '../integrations.ts';

export type { Evidence, Verification };
/** 'arkiv' and 'local' are built in; custom storage adapters report their own mode. */
export type StorageMode = 'arkiv' | 'local' | 'memory' | (string & {});
export type Peer = { id: string; name: string; address: string | null };
export type ApplicationState = ReturnType<typeof applicationState> & { storageMode?: StorageMode; peers?: Peer[] };
export type ApiVault = ApplicationState['groups'][number];
export type ApiTransaction = ApplicationState['transactions'][number];
export type MutationAction = 'signup' | 'login' | 'groups' | 'transactions' | 'approve' | 'register-safe';
/** Login of a scanner v2 identity also returns its profile: the client needs it to derive the key's wrapping password. */
export type MutationResponse = ApplicationState & { identityId?: string; keyEnvelope?: KeyEnvelope; objectProfile?: ObjectProfileV2 };
export type SafeStatus = { address?: string; balanceWei?: string; balanceEth: string; owners: string[]; threshold: number; chainId?: number; balanceUsdt?: string; guard?: string | null; nonce?: string; rehearsalToken?: boolean };

/** A legacy Base Sepolia Safe deployment recorded in the browser until the wallet transaction confirms. */
export type PendingSafe = { version: 1; name: string; creatorId: string; owners: `0x${string}`[]; saltNonce: string; address: `0x${string}`; phase: 'awaiting-wallet' | 'submitted'; deploymentTxHash?: Hex };
export type PreparedVault = Omit<PendingSafe, 'version' | 'phase' | 'deploymentTxHash'> & { chainId: number; threshold: number; transaction: { to: string; data: string; value: string } };

/** Usernames of scanner v2 object identities. Profiles and key envelopes are never listed. */
export type ObjectIdentityRecord = { name: string; address: string | null };
export type ObjectIdentitiesResponse = { identities: ObjectIdentityRecord[]; storageMode: StorageMode };

// ---------- Acoustic proof of attendance ----------
export type ProximitySessionView = NonNullable<ReturnType<typeof sessionView>>;
export type ProximityAction = 'start' | 'verify' | 'cancel';
/** `nonce` is returned only to the host that started (or resumed) an active check. */
export type ProximityResponse = { session: ProximitySessionView | null; nonce?: string };

// ---------- Whitechain treasury ----------
export type ApprovalSessionStatus = 'open' | 'executing' | 'submitted' | 'executed' | 'failed' | 'expired' | 'superseded';
/** A Safe transaction with bigint fields encoded as decimal strings. */
export type WireSafeTx = { to: Address; value: string; data: Hex; operation: 0; safeTxGas: string; baseGas: string; gasPrice: string; gasToken: Address; refundReceiver: Address; nonce: string };
export type ApprovalSession = {
 id: string; status: ApprovalSessionStatus; vaultId: string; vaultName: string; safe: Address; chainId: number;
 proposal: { id: string; to: string; amount: string; note: string; vendor: string | null } | null;
 initiator: string; threshold: number; approvals: { name: string; at: string }[]; approvedByMe: boolean; expiresAt: string;
 safeTx: WireSafeTx; safeTxHash: Hex; maxNetworkFeeUsdt: string; txHash: Hex | null; explorerUrl: string | null;
 /** `simulatedCode` is present only for the simulated presence provider (a documented demo limitation). */
 presence: { provider: string; mode: string; challengeId: string; simulatedCode?: string };
 error: string | null;
};
/** Only the initiator receives `emit`: the presence challenge their device broadcasts. */
export type StartSessionResponse = { session: ApprovalSession; emit: { challengeId: string; code: string; expiresAt: string } };
export type ApproveInSessionResponse = ApplicationState & { session: ApprovalSession };
export type InboxKeyResponse = { inboxKey: string; webhookSecret: string; endpoint: string };
export type RelayerStatus = { configured: false } | {
 configured: true; address: Address; guard: Address; verifier: Address;
 balanceWbt: string; usdtBalance: string; sponsoredTransactions: number; gasSpentWbt: string; averageCostWbt: string;
 transactionsLeft: number; refundsReceivedUsdt: string;
 limits: { maxFeeGwei: number; minBalanceWbt: string; dailyVaultDeploys: number; dailyExecutionsPerVault: number; gasRefundMicroUsdtPerGas: string };
 pending: { hash: Hex; purpose: 'deploy' | 'execute' } | null;
};
export type InvoiceReceipt = ReturnType<typeof invoiceView>;
