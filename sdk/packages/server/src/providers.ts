import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IntegrationProviders, PresenceSessionProvider } from '@tijori/core/integrations';
import { IntegrationUnavailableError } from '@tijori/core/integrations';
import { matchObjectProfile } from '@tijori/core/object-match';
import { validObjectProfileV2, validObjectQuery } from '@tijori/core/object-profile';
import { LEGACY_DINO_OBJECT_NAME } from '@tijori/core/legacy';
import { registerDefaults, type TijoriProviders } from './context.ts';

// Throttle wrong-object attempts per identity (in memory, per server process): 5 failures per 10 minutes.
const FAILURE_LIMIT = 5, FAILURE_WINDOW_MS = 10 * 60_000;
const failures = new Map<string, number[]>();
function recent(key: string) { const now = Date.now(); const list = (failures.get(key) ?? []).filter(at => now - at < FAILURE_WINDOW_MS); failures.set(key, list); return list; }
const throttled = (key: string) => recent(key).length >= FAILURE_LIMIT;
const recordFailure = (key: string) => { recent(key).push(Date.now()); };
/** Clear the wrong-object throttle (tests and operators). */
export const resetObjectThrottle = () => failures.clear();

/** Replace individual providers here; HTTP handlers and UI share these services. */
export const providers: IntegrationProviders = {
 objectMatching: {
  // Scanner v2 identities: the login photo's descriptor is matched here, on the server, against the enrolled
  // profile. Identities without a profile (older passphrase identities) keep the simulated description check.
  id: 'dino-object-v2', mode: 'live',
  async enroll(input) {
   if (input.objectProfile !== undefined) return { accepted: validObjectProfileV2(input.objectProfile), mode: 'live', provider: this.id };
   return { accepted: !!input.objectName.trim(), mode: 'simulated', provider: 'demo-description' };
  },
  async verify(enrollment, input) {
   // Scanner v1 object identities matched in the browser only; they must enroll again.
   if (enrollment.objectName === LEGACY_DINO_OBJECT_NAME) return { accepted: false, mode: 'live', provider: this.id };
   if (!validObjectProfileV2(enrollment.objectProfile)) return { accepted: !!enrollment.objectName && enrollment.objectName === input.objectName.trim(), mode: 'simulated', provider: 'demo-description' };
   const key = enrollment.identityId ?? enrollment.address;
   if (!validObjectQuery(input.objectQuery) || throttled(key)) return { accepted: false, mode: 'live', provider: this.id };
   const match = matchObjectProfile(enrollment.objectProfile, input.objectQuery);
   if (!match.matched) recordFailure(key); else failures.delete(key);
   return { accepted: match.matched, mode: 'live', provider: this.id, score: Math.round(match.score * 1000) / 1000 };
  },
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

/** The default provider set. Override any of them with createTijoriServer({ providers: { ... } }). */
export const defaultProviders: TijoriProviders = { ...providers, presence: presenceProvider };
registerDefaults({ providers: () => defaultProviders });
