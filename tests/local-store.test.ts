import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withLocalStore } from '@tijori/server/storage/local-file';
import { applyAction } from '@tijori/core/vault';

test('local storage serializes device writes, encrypts records, preserves reads, and refuses missing/corrupt state', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'tijori-local-unit-'));
 try {
  const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
  await Promise.all([1, 2].map(n => withLocalStore(async store => {
   const previous = await store.read();
   applyAction(previous.vault, 'signup', { name: `Local synthetic device ${n}`, address: '0x' + String(n).repeat(40), objectName: 'local-object-fixture', keyEnvelope });
   await store.write(previous.vault, previous);
  }, directory)));
  const before = await readFile(join(directory, 'state.json'), 'utf8');
  assert.ok(!before.includes('Local synthetic'));
  await withLocalStore(async store => { const state = await store.read(); assert.equal(state.vault.wallets.length, 2); assert.equal(state.revision, 2n); }, directory);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before, 'polling must not rewrite storage');
  await writeFile(join(directory, 'state.json'), '{}');
  await assert.rejects(withLocalStore(store => store.read(), directory), /invalid/);
  await unlink(join(directory, 'state.json'));
  await assert.rejects(withLocalStore(store => store.read(), directory), /nothing was reset/);
  await writeFile(join(directory, 'state.json'), before);
  await unlink(join(directory, 'encryption.key'));
  await assert.rejects(withLocalStore(store => store.read(), directory), /key is missing/);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
