import { randomInt, randomUUID, sha256Hex } from './random.ts';
import { VaultError, type Vault } from './vault.ts';

export type ProximitySession = {
 id: string; groupId: string; hostId: string; nonce: string; createdAt: number; expiresAt: number;
 cancelled: boolean; operationId: string;
 matches: { walletId: string; verifiedAt: number; attestationHash: string }[];
};
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
export function proximityMember(vault: Vault, groupId: string, walletId: string) {
 const group = vault.groups.find(g => g.id === groupId);
 if (!group?.memberIds.includes(walletId) || !vault.wallets.some(w => w.id === walletId && w.object_name)) {
  throw new VaultError('Sign up as an invited vault member first.');
 }
}
export function latestSession(vault: Vault, groupId: string) {
 return vault.proximitySessions.findLast(s => s.groupId === groupId);
}
export function sessionView(s: ProximitySession | undefined, now = Date.now()) {
 if (!s) return null;
 return { id: s.id, groupId: s.groupId, hostId: s.hostId, createdAt: s.createdAt, expiresAt: s.expiresAt,
  status: s.cancelled ? 'cancelled' : s.expiresAt <= now ? 'expired' : 'active', matches: s.matches };
}
// Called only while holding the shared Arkiv signer lock. No proximity action touches transfers.
export function applyProximity(vault: Vault, b: Record<string, unknown>, operationId: string, now = Date.now()) {
 const groupId = text(b.groupId), walletId = text(b.walletId);
 proximityMember(vault, groupId, walletId);
 let s = latestSession(vault, groupId);
 if (b.action === 'start') {
  const previous = vault.proximitySessions.find(s => s.operationId === operationId);
  if (previous) {
   if (previous.groupId !== groupId || previous.hostId !== walletId) throw new VaultError('This operation ID was already used with different input.');
   return { changed: false, session: sessionView(previous, now), ...(previous === s && !previous.cancelled && previous.expiresAt > now ? { nonce: previous.nonce } : {}) };
  }
  if (s && !s.cancelled && s.expiresAt > now) throw new VaultError('A check is already active. Join it or wait for it to finish.');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let nonce: string;
  do { nonce = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (vault.proximitySessions.some(s => s.nonce === nonce));
  s = { id: randomUUID(), groupId, hostId: walletId, nonce, createdAt: now, expiresAt: now + 120000, cancelled: false, operationId, matches: [] };
  vault.proximitySessions.push(s);
  return { changed: true, session: sessionView(s, now), nonce };
 }
 if (!s || s.id !== text(b.sessionId)) throw new VaultError('This check ended. Start or join a new check.');
 if (b.action === 'cancel') {
  if (s.hostId !== walletId) throw new VaultError('Only the broadcaster can end this check.');
  // A repeated stop must not spend another fee, including after its receipt was lost.
  if (s.cancelled) return { changed: false, session: sessionView(s, now) };
 }
 if (s.cancelled || s.expiresAt <= now) throw new VaultError('This check ended. Start or join a new check.');
 if (b.action === 'cancel') s.cancelled = true;
 else if (b.action === 'verify') {
  if (s.hostId === walletId) throw new VaultError('Join from another vault member’s device.');
  if (text(b.nonce) !== s.nonce) throw new VaultError('Heard a different signal. Keep listening near your vault broadcaster.');
  if (s.matches.some(m => m.walletId === walletId)) return { changed: false, session: sessionView(s, now) };
  const attestationHash = sha256Hex(`${s.id}:${s.nonce}:${s.hostId}:${walletId}:${now}`);
  s.matches.push({ walletId, verifiedAt: now, attestationHash });
 } else throw new VaultError('Unknown proximity action.');
 return { changed: true, session: sessionView(s, now) };
}

export function validateProximity(vault: Vault) {
 const sessions = vault.proximitySessions;
 const unique = (xs: string[]) => new Set(xs).size === xs.length;
 const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100;
 if (!Array.isArray(sessions) || !sessions.every(s => {
  const group = vault.groups.find(g => g.id === s?.groupId);
  return s && id(s.id) && id(s.operationId) && group?.memberIds.includes(s.hostId) && typeof s.nonce === 'string' && /^[A-Z0-9]{6}$/.test(s.nonce)
   && Number.isSafeInteger(s.createdAt) && s.createdAt >= 0 && Number.isSafeInteger(s.expiresAt) && s.expiresAt === s.createdAt + 120000 && typeof s.cancelled === 'boolean'
   && Array.isArray(s.matches) && unique(s.matches.map(m => m?.walletId)) && s.matches.every(m => m && m.walletId !== s.hostId && group.memberIds.includes(m.walletId)
    && Number.isSafeInteger(m.verifiedAt) && m.verifiedAt >= s.createdAt && m.verifiedAt < s.expiresAt && typeof m.attestationHash === 'string' && /^[a-f0-9]{64}$/.test(m.attestationHash));
 }) || !unique(sessions.map(s => s.id)) || !unique(sessions.map(s => s.nonce)) || !unique(sessions.map(s => s.operationId))) throw new Error('Invalid proximity state.');
 // Stored order determines the latest session. Only one session per vault can run at a time.
 const previous = new Map<string, ProximitySession>();
 for (const s of sessions) {
  const p = previous.get(s.groupId);
  if (p && (s.createdAt < p.createdAt || (!p.cancelled && s.createdAt < p.expiresAt))) throw new Error('Overlapping proximity sessions.');
  previous.set(s.groupId, s);
 }
}
