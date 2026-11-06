/** Server-side integration contracts. Never implement these in a browser component. */
import type { ObjectQuery, StoredObjectProfile } from './object-profile.ts';
/** `score` is the provider's similarity, when it has one (scanner v2 object matching). */
export type Verification = { accepted: boolean; mode: 'simulated' | 'live'; provider: string; score?: number };
// References point to a separately reviewed capture system. No images, keys or passphrases.
export type Evidence = { reference: string; challengeId: string };
/** `objectProfile` is the enrolled scanner v2 profile, when the identity has one. */
export type ObjectEnrollment = { identityId?: string; address: string; objectName: string; objectProfile?: StoredObjectProfile };
export type ApprovalContext = {
 identityId: string;
 groupId: string;
 transactionId: string;
 recipient: string;
 amount: number;
 asset: string;
};
export type ExternalApprovalContext = {
 applicationId: string;
 identityAddress: string;
 vaultAddress: string;
 chainId: number;
 transactionHash: string;
 evidence: Evidence;
};
export interface ObjectMatchingProvider {
 readonly id: string;
 readonly mode: 'simulated' | 'live';
 enroll(input: ObjectEnrollment, evidence?: Evidence): Promise<Verification>;
 /** Scanner v2 identities send `objectQuery` (the photo's descriptor); description identities send `objectName`. */
 verify(enrollment: ObjectEnrollment, input: { objectName: string; objectQuery?: ObjectQuery; evidence?: Evidence }): Promise<Verification>;
}
export interface PhysicalApprovalProvider {
 readonly id: string;
 readonly mode: 'simulated' | 'live';
 discover(input: { identityId: string; groupId: string; evidence?: Evidence }): Promise<Verification>;
 verify(context: ApprovalContext, evidence?: Evidence): Promise<Verification>;
}
export interface ExternalVaultProvider {
 readonly id: string;
 readonly configured: boolean;
 // Implement authorization, challenge freshness and exact transaction binding here.
 // This result never executes a transaction or changes the local vault aggregate.
 verifyApproval(context: ExternalApprovalContext): Promise<Verification>;
}
export type IntegrationProviders = {
 objectMatching: ObjectMatchingProvider;
 physicalApproval: PhysicalApprovalProvider;
 externalVault: ExternalVaultProvider;
};
export class IntegrationUnavailableError extends Error {}

/**
 * Co-presence for a treasury approval session (Whitechain vaults). The initiator's device emits
 * `code` (for example ultrasonically); every approver's device must prove it received that code
 * during the session window. Implementations must reject replayed, relayed or stale evidence.
 * Frequency matching alone is not proof of proximity.
 */
export type PresenceChallenge = { challengeId: string; code: string; expiresAt: string };
export type PresenceContext = { sessionId: string; vaultId: string; identityId: string; safeTxHash: string; challenge: PresenceChallenge };
export interface PresenceSessionProvider {
 readonly id: string;
 readonly mode: 'simulated' | 'live';
 createChallenge(input: { sessionId: string; vaultId: string; safeTxHash: string; expiresAt: string }): Promise<PresenceChallenge>;
 verify(context: PresenceContext, evidence?: Evidence): Promise<Verification>;
}
