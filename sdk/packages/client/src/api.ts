// Typed HTTP client for a self-hosted @tijori/server (all calls go to its /v1 API).
import type {
 ApiTransaction, ApplicationState, ApprovalSession, ApproveInSessionResponse, Evidence, InboxKeyResponse, InvoiceReceipt,
 MutationAction, MutationResponse, ObjectIdentitiesResponse, PreparedVault, ProximityResponse, RelayerStatus, SafeStatus,
 StartSessionResponse, Verification,
} from '@tijori/core/api/types';
import type { ObjectQuery } from '@tijori/core/object-profile';

export type * from '@tijori/core/api/types';
export type TijoriClientOptions = {
 /** URL of the server's /v1 API, e.g. '/api/tijori/v1' or 'https://dao.example/api/tijori/v1'. Default '/api/v1'. */
 baseUrl?: string;
 /** Custom fetch (auth headers, retries, tests). Defaults to the global fetch. */
 fetch?: typeof fetch;
};
type RequestOptions = { operationId?: string; signal?: AbortSignal; keepalive?: boolean };
const paths: Record<MutationAction, string> = { signup: 'identities', login: 'identities/login', groups: 'groups', transactions: 'transactions', approve: 'physical-approvals', 'register-safe': 'vaults/register-safe' };

/** Error returned by the Tijori API. `status` is the HTTP status (400 validation, 401, 501 unconfigured, 503 storage). */
export class TijoriError extends Error {
 readonly status: number;
 constructor(message: string, status: number) { super(message); this.name = 'TijoriError'; this.status = status; }
}

export function createTijoriClient(options: TijoriClientOptions | string = {}, legacyFetcher?: typeof fetch) {
 const config = typeof options === 'string' ? { baseUrl: options, fetch: legacyFetcher } : options;
 const base = (config.baseUrl ?? '/api/v1').replace(/\/+$/, '');
 const fetcher: typeof fetch = config.fetch ?? ((input, init) => fetch(input, init));
 const withQuery = (path: string, query: Record<string, string>) => `${path}?${Object.entries(query).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
 async function request<T>(path: string, body?: object, { operationId, signal, keepalive }: RequestOptions = {}): Promise<T> {
  const response = await fetcher(`${base}/${path}`, body === undefined ? { cache: 'no-store', signal } : {
   method: 'POST', signal, keepalive,
   headers: { 'Content-Type': 'application/json', ...(operationId ? { 'Idempotency-Key': operationId } : {}) }, body: JSON.stringify(body),
  });
  let result: { error?: string } & Record<string, unknown>;
  try { result = await response.json(); } catch { throw new TijoriError(`The Tijori API returned an invalid response (HTTP ${response.status}).`, response.status); }
  if (!response.ok) throw new TijoriError(result.error || 'Could not process this request.', response.status);
  return result as T;
 }
 return {
  baseUrl: base,
  capabilities: () => request<Record<string, unknown>>('capabilities'),
  state: (identityId?: string) => request<ApplicationState>(identityId ? withQuery('state', { identityId }) : 'state'),
  balance: (vaultId: string) => request<SafeStatus>(withQuery('balance', { vaultId })),
  mutate: (action: MutationAction, body: object, operationId: string) => request<MutationResponse>(paths[action], body, { operationId }),
  /** Scanner v2 login: the server matches the photo and, only on a match, returns the key envelope and profile. */
  objectLogin: (username: string, objectQuery: ObjectQuery, operationId: string) => request<MutationResponse>('identities/login', { username, objectQuery }, { operationId }),
  /** Enrolled object identities (encrypted key envelopes and compact reference profiles) for sign-in on a new device. */
  objectIdentities: () => request<ObjectIdentitiesResponse>('object-identities'),
  discover: (identityId: string, groupId: string, evidence?: Evidence) => request<{ requests: ApiTransaction[]; verification: Verification }>('physical-approvals/discover', { identityId, groupId, evidence }),
  verifyObject: (address: string, objectName: string, evidence?: Evidence) => request<{ identityId: string; verification: Verification }>('objects/verify', { address, objectName, evidence }),
  prepareVault: (name: string, creatorId: string, owners: string[]) => request<PreparedVault>('vaults/prepare', { name, creatorId, owners }),
  // Whitechain treasury: gasless guarded Safe vaults and co-present approval sessions.
  createWhitechainVault: (name: string, creatorId: string, addresses: string[], operationId: string) => request<MutationResponse & { vaultId?: string }>('vaults/whitechain', { name, creatorId, addresses }, { operationId }),
  propose: (body: { vaultId: string; proposerId: string; to?: string; amount?: string; note?: string; invoiceId?: string }, operationId: string) => request<MutationResponse & { proposalId?: string }>('proposals', body, { operationId }),
  startSession: (proposalId: string, initiatorId: string) => request<StartSessionResponse>('approval-sessions', { proposalId, initiatorId }),
  sessions: (identityId: string) => request<{ sessions: ApprovalSession[] }>(withQuery('treasury/sessions', { identityId })),
  /** Scanner v2 identities send `objectQuery` (a fresh photo's descriptor); older passphrase identities send `objectName`. */
  approveInSession: (body: { sessionId: string; walletId: string; objectName: string; objectQuery?: ObjectQuery; signature: string; evidence: Evidence }) => request<ApproveInSessionResponse>('physical-approvals', body),
  inboxKey: (body: { vaultId: string; identityId: string; issuedAt: string; signature: string }) => request<InboxKeyResponse>('vaults/inbox-key', body),
  relayer: () => request<RelayerStatus>('relayer'),
  invoiceReceipt: async (id: string) => (await request<{ invoice: InvoiceReceipt }>(withQuery('invoices/receipt', { id }))).invoice,
  exportUrl: (vaultId: string, identityId: string) => `${base}/${withQuery('treasury/export', { vaultId, identityId })}`,
  // Acoustic proof of attendance. Polling (status) never writes; start/verify/cancel are idempotent per operation.
  proximity: {
   status: (groupId: string, walletId: string, signal?: AbortSignal) => request<ProximityResponse>(withQuery('proximity', { groupId, walletId }), undefined, { signal }),
   start: (groupId: string, walletId: string, operationId: string) => request<ProximityResponse>('proximity', { action: 'start', groupId, walletId }, { operationId }),
   verify: (groupId: string, walletId: string, sessionId: string, nonce: string) => request<ProximityResponse>('proximity', { action: 'verify', groupId, walletId, sessionId, nonce }),
   cancel: (groupId: string, walletId: string, sessionId: string, options: { keepalive?: boolean } = {}) => request<ProximityResponse>('proximity', { action: 'cancel', groupId, walletId, sessionId }, options),
  },
 };
}
export type TijoriClient = ReturnType<typeof createTijoriClient>;

/** @deprecated Renamed to createTijoriClient. */
export const createTichoriClient = createTijoriClient;
/** @deprecated Renamed to TijoriError. */
export const TichoriError = TijoriError;
