import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IntegrationProviders, PresenceSessionProvider } from '@tijori/core/integrations';
import { IntegrationUnavailableError } from '@tijori/core/integrations';
import { matchObjectProfile } from '@tijori/core/object-match';
import { validObjectProfileV2, validObjectQuery } from '@tijori/core/object-profile';
import { LEGACY_DINO_OBJECT_NAME } from '@tijori/core/legacy';
import { VaultError } from '@tijori/core/vault';
import { newAcousticCode } from '@tijori/core/acoustic-code';
import { registerDefaults, type TijoriProviders } from './context.ts';

// Throttle wrong-object attempts per identity (in memory, per server process): 8 failures per 2 minutes.
const FAILURE_LIMIT = 8, FAILURE_WINDOW_MS = 2 * 60_000;
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
   if (throttled(key)) throw new VaultError('Too many wrong-object attempts for this username. Wait two minutes, then try again with your registered object.');
   if (!validObjectQuery(input.objectQuery)) return { accepted: false, mode: 'live', provider: this.id };
   const match = matchObjectProfile(enrollment.objectProfile, input.objectQuery);
   if (!match.matched) recordFailure(key); else failures.delete(key);
   // Scores only (no descriptors or keys), to tune the threshold from real use.
   console.info(`[tijori] object match ${match.matched ? 'accepted' : 'rejected'}: score ${match.score.toFixed(3)} (threshold ${match.threshold}, best view ${match.view})`);
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

const freshMatch = (context: Parameters<PresenceSessionProvider['verify']>[0], evidence: Parameters<PresenceSessionProvider['verify']>[1]) => {
 const fresh = Date.parse(context.challenge.expiresAt) > Date.now();
 const matches = !!evidence && evidence.challengeId === context.challenge.challengeId && evidence.reference.length === context.challenge.code.length && timingSafeEqual(Buffer.from(evidence.reference), Buffer.from(context.challenge.code));
 return fresh && matches;
};

/**
 * Acoustic co-presence (the default): the server creates a 6-character code that only the initiator receives. The
 * initiator's device plays it with the acoustic modem (ggwave), and each member's device must hear it and send it
 * back with their approval. The code never appears in session listings. It proves only that a device heard the
 * code during the session: a code can be replayed or relayed, so this is not proof of identity or of distance.
 */
export const presenceProvider: PresenceSessionProvider = {
 id: 'ggwave-acoustic', mode: 'live',
 async createChallenge({ expiresAt }) { return { challengeId: randomUUID(), code: newAcousticCode(), expiresAt }; },
 async verify(context, evidence) { return { accepted: freshMatch(context, evidence), mode: 'live', provider: this.id }; },
};

/**
 * Simulated co-presence, for testing without audio: session listings show the code to every member, so the check
 * proves nothing. Opt in with createTijoriServer({ providers: { presence: simulatedPresenceProvider } }).
 */
export const simulatedPresenceProvider: PresenceSessionProvider = {
 id: 'demo-ultrasonic', mode: 'simulated',
 async createChallenge({ expiresAt }) { return { challengeId: randomUUID(), code: randomBytes(4).toString('hex'), expiresAt }; },
 async verify(context, evidence) { return { accepted: freshMatch(context, evidence), mode: 'simulated', provider: this.id }; },
};

/** The default provider set. Override any of them with createTijoriServer({ providers: { ... } }). */
export const defaultProviders: TijoriProviders = { ...providers, presence: presenceProvider };
registerDefaults({ providers: () => defaultProviders });
