import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomInt, randomUUID, sha256Hex } from '@tijori/core/random';
import * as legacy from '@tijori/core/legacy';
import * as core from '@tijori/core';

test('core randomness and hashing match node:crypto output formats', () => {
 for (const value of ['', 'abc', 'session:ABCDEF:host:wallet:1700000000000', 'ünïcødé']) assert.equal(sha256Hex(value), createHash('sha256').update(value).digest('hex'));
 assert.match(randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const seen = new Set<number>();
 for (let i = 0; i < 2000; i++) { const n = randomInt(32); assert.ok(n >= 0 && n < 32); seen.add(n); }
 assert.equal(seen.size, 32);
});

test('frozen identifiers keep their exact persisted values', () => {
 assert.deepEqual({ ...legacy }, {
  LEGACY_IDENTITY_AAD_PREFIX: 'tichori-identity-v1:', LEGACY_OBJECT_WRAP_DOMAIN: 'tichori-insecure-object-demo-v1:', LEGACY_OBJECT_RECOVERY_KIND: 'tichori-insecure-object-demo',
  LEGACY_IDENTITY_DB: 'tichori-object-identities', LEGACY_PENDING_SAFE_KEY: 'tichori-pending-safe-v1', LEGACY_SAFE_DEPLOY_LOCK: 'tichori-safe-deployment', LEGACY_PROXIMITY_SESSION_PREFIX: 'tichori-proximity:',
  LEGACY_ARKIV_SCHEMA: 'tichori_state_v1', LEGACY_ARKIV_ENCODING: 'tichori/aes-256-gcm/v1', LEGACY_ARKIV_NAMESPACE: 'tichori-local-v1', LEGACY_LOCAL_STORE_CONTEXT: 'tichori-local-acoustic-demo-v1',
  LEGACY_API_KEYS_INFO: 'tichori-api-keys-v1', LEGACY_GUARD_DOMAIN_NAME: 'TichoriPresenceGuard', LEGACY_INBOX_KEY_MESSAGE_PREFIX: 'Tichori: issue the invoice inbox key',
 });
 assert.equal(core.attestationTypedData(1874, '0x0000000000000000000000000000000000000001', { safe: '0x0000000000000000000000000000000000000002', safeTxHash: `0x${'00'.repeat(32)}`, sessionId: `0x${'00'.repeat(32)}`, approvers: [], ref: `0x${'00'.repeat(32)}`, expiresAt: 0n }).domain.name, 'TichoriPresenceGuard');
});

test('@tijori/core stays isomorphic: no node:* imports in its sources', async () => {
 const root = new URL('../packages/core/src/', import.meta.url).pathname;
 const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
 for (const file of await walk(root)) assert.doesNotMatch(await readFile(file, 'utf8'), /from ['"]node:|import\(['"]node:/, file);
});
