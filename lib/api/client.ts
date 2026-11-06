import type { applicationState } from './domain.ts';
import type { Evidence, Verification } from '../integrations/contracts.ts';
import type { KeyEnvelope } from '../identity-key.ts';
import type { PendingSafe } from '../safe-client.ts';

export type ApplicationState = ReturnType<typeof applicationState>;
export type ApiTransaction = ApplicationState['transactions'][number];
export type MutationResponse = ApplicationState & { identityId?: string; keyEnvelope?: KeyEnvelope };
export type SafeStatus = { balanceEth: string; owners: string[]; threshold: number };
export type PreparedVault = Omit<PendingSafe, 'version' | 'phase' | 'deploymentTxHash'> & { chainId: number; threshold: number; transaction: { to: string; data: string; value: string } };
export type MutationAction = 'signup' | 'login' | 'groups' | 'transactions' | 'approve' | 'register-safe';
const paths: Record<MutationAction, string> = { signup: 'identities', login: 'identities/login', groups: 'groups', transactions: 'transactions', approve: 'physical-approvals', 'register-safe': 'vaults/register-safe' };

/** Usable by another UI or a trusted local server. baseUrl may be an absolute URL. */
export function createTichoriClient(baseUrl = '/api/v1', fetcher: typeof fetch = fetch) {
 async function request<T>(path: string, body?: object, operationId?: string): Promise<T> {
  const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/${path}`, body === undefined ? { cache: 'no-store' } : {
   method: 'POST', headers: { 'Content-Type': 'application/json', ...(operationId ? { 'Idempotency-Key': operationId } : {}) }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not process this request.');
  return result as T;
 }
 return {
  state: (identityId?: string) => request<ApplicationState>('state' + (identityId ? '?identityId=' + encodeURIComponent(identityId) : '')),
  balance: (vaultId: string) => request<SafeStatus>('balance?vaultId=' + encodeURIComponent(vaultId)),
  mutate: (action: MutationAction, body: object, operationId: string) => request<MutationResponse>(paths[action], body, operationId),
  discover: (identityId: string, groupId: string, evidence?: Evidence) => request<{ requests: ApiTransaction[]; verification: Verification }>('physical-approvals/discover', { identityId, groupId, evidence }),
  verifyObject: (address: string, objectName: string, evidence?: Evidence) => request<{ identityId: string; verification: Verification }>('objects/verify', { address, objectName, evidence }),
  prepareVault: (name: string, creatorId: string, owners: string[]) => request<PreparedVault>('vaults/prepare', { name, creatorId, owners }),
 };
}
export const tichori = createTichoriClient();
