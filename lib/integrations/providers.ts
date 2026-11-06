import type { IntegrationProviders } from './contracts.ts';
import { IntegrationUnavailableError } from './contracts.ts';

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
