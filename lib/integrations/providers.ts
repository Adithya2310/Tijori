import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IntegrationProviders, PresenceSessionProvider } from '@tijori/core/integrations';
import { IntegrationUnavailableError } from '@tijori/core/integrations';

/** Replace individual providers here; HTTP handlers and UI share these services. */
export const providers: IntegrationProviders = {
 objectMatching: {
  id: 'demo-description', mode: 'simulated',
  async enroll(input) { return { accepted: !!input.objectName.trim(), mode: 'simulated', provider: this.id }; },
  async verify(enrollment, input) { return { accepted: !!enrollment.objectName && enrollment.objectName === input.objectName.trim(), mode: 'simulated', provider: this.id }; },
 },
 physicalApproval: {
  id: 'demo-listening', mode: 'simulated',
  async discover() { return { accepted: true, mode: 'simulated', provider: this.id }; },
  async verify() { return { accepted: true, mode: 'simulated', provider: this.id }; },
 },
 externalVault: {
  id: 'unconfigured', configured: false,
  async verifyApproval() { throw new IntegrationUnavailableError('External vault approval verification is not configured.'); },
 },
};

/**
 * Simulated co-presence: the code is created server-side and, in simulated mode only, shown to
 * approvers by the API so the flow can be demonstrated without audio. Replace with the ultrasonic
 * provider (emit `code` on the initiator device, decode it on approvers' devices).
 */
export const presenceProvider: PresenceSessionProvider = {
 id: 'demo-ultrasonic', mode: 'simulated',
 async createChallenge({ expiresAt }) { return { challengeId: randomUUID(), code: randomBytes(4).toString('hex'), expiresAt }; },
 async verify(context, evidence) {
  const fresh = Date.parse(context.challenge.expiresAt) > Date.now();
  const matches = !!evidence && evidence.challengeId === context.challenge.challengeId && evidence.reference.length === context.challenge.code.length && timingSafeEqual(Buffer.from(evidence.reference), Buffer.from(context.challenge.code));
  return { accepted: fresh && matches, mode: 'simulated', provider: this.id };
 },
};
