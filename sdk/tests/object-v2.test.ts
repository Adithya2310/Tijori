import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_IDENTITY_NAME, OBJECT_PROFILE_MAX_VIEWS, packObjectProfileV2, packObjectQuery, packObjectView, unpackObjectView, validObjectProfileV2, validObjectQuery, type ObjectDescriptor } from '@tijori/core/object-profile';
import { matchObjectProfile, OBJECT_MATCH_THRESHOLD } from '@tijori/core/object-match';
import { applyAction, emptyVault, objectIdentityByUsername, validateVault } from '@tijori/core/vault';
import { LEGACY_DINO_OBJECT_NAME } from '@tijori/core/legacy';
import { createTijoriServer, memoryStorage } from '@tijori/server';
import { resetObjectThrottle } from '@tijori/server/providers';

// Deterministic synthetic descriptors: an "object" is a random direction; views of the same object add small noise.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; }; }
const vector = (random: () => number) => Array.from({ length: 384 }, random);
const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => x / n); };
const jitter = (base: number[], amount: number, random: () => number) => unit(base.map(x => x + amount * random()));
function object(seed: number) { const random = rng(seed); const cls = unit(vector(random)), fg = unit(vector(random)); return { cls, fg, view: (noise = 0.02): ObjectDescriptor => ({ cls: jitter(cls, noise, random), fg: jitter(fg, noise, random) }) }; }
const keyEnvelope = { version: 1 as const, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
const address = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const bottle = object(1), pen = object(2);

test('v2 views pack to 1 KB, round-trip precisely and validate strictly', () => {
 const view = packObjectView(bottle.view());
 assert.equal(view.length, 1024);
 const unpacked = unpackObjectView(view);
 let dot = 0; for (let i = 0; i < 384; i++) dot += unpacked.cls[i] * bottle.cls[i];
 assert.ok(dot > 0.99, `quantisation keeps direction (${dot})`);
 const profile = packObjectProfileV2([bottle.view(), bottle.view(), bottle.view()]);
 assert.ok(validObjectProfileV2(profile));
 assert.ok(JSON.stringify(profile).length < 3400, 'about 1 KB per view');
 assert.equal(validObjectProfileV2({ ...profile, views: [] }), false);
 assert.equal(validObjectProfileV2({ ...profile, views: Array(OBJECT_PROFILE_MAX_VIEWS + 1).fill(profile.views[0]) }), false);
 assert.equal(validObjectProfileV2({ ...profile, views: [profile.views[0], profile.views[0]] }), false, 'duplicate views');
 assert.equal(validObjectProfileV2({ ...profile, extra: 1 }), false);
 assert.equal(validObjectProfileV2({ ...profile, views: ['A'.repeat(1024)] }), false, 'empty vectors');
 assert.throws(() => packObjectView({ cls: Array(384).fill(0), fg: bottle.fg }), /Empty/);
 assert.ok(validObjectQuery(packObjectQuery(bottle.view())));
 assert.equal(validObjectQuery({ ...packObjectQuery(bottle.view()), view: profile.views[0].slice(1) }), false);
});

test('the matcher accepts the enrolled object from another view and rejects a different object', () => {
 const profile = packObjectProfileV2([bottle.view(), bottle.view(0.05), bottle.view(0.08)]);
 const same = matchObjectProfile(profile, packObjectQuery(bottle.view(0.06)));
 assert.equal(same.matched, true); assert.ok(same.score > OBJECT_MATCH_THRESHOLD);
 const other = matchObjectProfile(profile, packObjectQuery(pen.view()));
 assert.equal(other.matched, false); assert.ok(other.score < 0.3, `unrelated object scores low (${other.score})`);
 assert.equal(matchObjectProfile(profile, packObjectQuery(bottle.view(0.06)), { threshold: 0.9999 }).matched, false);
 assert.throws(() => matchObjectProfile(profile, { version: 2 } as never), /descriptor/);
});

test('v2 sign-ups need a v2 profile and a unique username; legacy names do not block re-registration', () => {
 const vault = emptyVault();
 vault.wallets.push({ id: 'old', name: 'sub', address: address(9), keyEnvelope, object_name: LEGACY_DINO_OBJECT_NAME, created_at: 'then' });
 const profile = packObjectProfileV2([bottle.view()]);
 applyAction(vault, 'signup', { name: 'sub', address: address(1), keyEnvelope, objectName: OBJECT_IDENTITY_NAME, objectProfile: profile });
 assert.equal(objectIdentityByUsername(vault, '  SUB ')?.address, address(1));
 assert.throws(() => applyAction(vault, 'signup', { name: 'Sub', address: address(2), keyEnvelope, objectName: OBJECT_IDENTITY_NAME, objectProfile: packObjectProfileV2([pen.view()]) }), /username is taken/);
 assert.throws(() => applyAction(vault, 'signup', { name: 'pen', address: address(3), keyEnvelope, objectName: 'mug', objectProfile: profile }), /Invalid object profile/);
 assert.equal(validateVault(structuredClone(vault)).version, 7);
});

test('the server matches the login photo, releases key material only on a match, and throttles guessing', async () => {
 resetObjectThrottle();
 const vault = emptyVault();
 vault.wallets.push({ id: 'legacy', name: 'old-user', address: address(7), keyEnvelope, object_name: LEGACY_DINO_OBJECT_NAME, created_at: 'then' });
 const server = createTijoriServer({ storage: memoryStorage(vault) });
 const post = (path: string, body: unknown) => server.fetch(new Request(`http://t.test/api/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
 const profile = packObjectProfileV2([bottle.view(), bottle.view(0.05), bottle.view(0.08)]);
 assert.equal((await post('identities', { name: 'sub', address: address(1), keyEnvelope, objectName: OBJECT_IDENTITY_NAME, objectProfile: profile })).status, 200);

 const listed = await (await server.fetch(new Request('http://t.test/api/v1/object-identities'))).json();
 assert.deepEqual(listed.identities, [{ name: 'sub', address: address(1) }]);
 assert.ok(!JSON.stringify(listed).includes(profile.views[0]) && !JSON.stringify(listed).includes('ciphertext'), 'no profiles or key envelopes are listed');

 const wrong = await post('identities/login', { username: 'sub', objectQuery: packObjectQuery(pen.view()) });
 const wrongBody = await wrong.json();
 assert.equal(wrong.status, 400); assert.match(wrongBody.error, /not the object registered/);
 assert.ok(!('keyEnvelope' in wrongBody) && !('objectProfile' in wrongBody));

 const right = await post('identities/login', { username: 'SUB', objectQuery: packObjectQuery(bottle.view(0.06)) });
 const rightBody = await right.json();
 assert.equal(right.status, 200);
 assert.deepEqual(rightBody.keyEnvelope, keyEnvelope); assert.deepEqual(rightBody.objectProfile, profile);

 assert.equal((await post('identities/login', { username: 'sub' })).status, 400, 'a username alone never logs in');
 assert.match((await (await post('identities/login', { username: 'nobody', objectQuery: packObjectQuery(bottle.view()) })).json()).error, /No object identity/);
 assert.match((await (await post('identities/login', { username: 'old-user', objectQuery: packObjectQuery(bottle.view()) })).json()).error, /older scanner/);
 assert.match((await (await post('identities/login', { address: address(7), objectName: LEGACY_DINO_OBJECT_NAME })).json()).error, /older scanner/);
 assert.match((await (await post('identities/login', { address: address(1), objectName: OBJECT_IDENTITY_NAME })).json()).error, /username and a photo/);

 for (let i = 0; i < 5; i++) await post('identities/login', { username: 'sub', objectQuery: packObjectQuery(pen.view()) });
 assert.equal((await post('identities/login', { username: 'sub', objectQuery: packObjectQuery(bottle.view(0.06)) })).status, 400, 'throttled after repeated wrong objects');
 resetObjectThrottle();
 assert.equal((await post('identities/login', { username: 'sub', objectQuery: packObjectQuery(bottle.view(0.06)) })).status, 200);
});

test('real photos: different everyday objects never match each other at the shipped threshold', async () => {
 const { readFile } = await import('node:fs/promises');
 const { unpackObjectView } = await import('@tijori/core/object-profile');
 const { compareObjectViews } = await import('@tijori/core/object-match');
 const { samples } = JSON.parse(await readFile(new URL('./fixtures/real-objects.json', import.meta.url), 'utf8')) as { samples: { label: string; view: string; objectFraction: number; grid: string }[] };
 assert.ok(samples.length >= 3);
 for (const sample of samples) {
  assert.ok(sample.objectFraction > 0.01 && sample.objectFraction < 0.5, `${sample.label} was isolated, not the whole frame`);
  assert.equal(sample.grid.length, 256);
 }
 for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
  if (samples[i].label === samples[j].label) continue;
  const { score } = compareObjectViews(unpackObjectView(samples[i].view), unpackObjectView(samples[j].view));
  assert.ok(score < OBJECT_MATCH_THRESHOLD - 0.3, `${samples[i].label} vs ${samples[j].label} scored ${score.toFixed(3)}`);
 }
});
