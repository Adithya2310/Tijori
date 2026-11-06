/** Server-side integration contracts. Never implement these in a browser component. */
export type Verification = { accepted: boolean; mode: 'simulated' | 'live'; provider: string };
// References point to a separately reviewed capture system. No images, keys or passphrases.
export type Evidence = { reference: string; challengeId: string };
export type ObjectEnrollment = { identityId?: string; address: string; objectName: string };
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
 verify(enrollment: ObjectEnrollment, input: { objectName: string; evidence?: Evidence }): Promise<Verification>;
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
