import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rpcFixture } from './rpc-fixture.mjs';
import { withLocalStore } from '@tijori/server/storage/local-file';
import { applyAction } from '@tijori/core/vault';
import { privateKeyToAccount } from 'viem/accounts';

const directory = await mkdtemp(join(tmpdir(), 'tijori-migrate-flow-'));
const rpc = await rpcFixture();
const key = '0x' + '11'.repeat(32);
const cli = resolve(import.meta.dirname, '../packages/server/src/cli.ts');
const env = { ...process.env, LOCAL_DEMO_DATA_DIR: join(directory, 'local'), VAULT_DATA_DIR: directory, ARKIV_ACCESS_KEY: 'fixture', ARKIV_WALLET_PRIVATE_KEY: key, ARKIV_WALLET_ADDRESS: privateKeyToAccount(key).address, ARKIV_STATE_ENCRYPTION_KEY: '22'.repeat(32), ARKIV_NAMESPACE: 'migration-fixture', ARKIV_MAX_TOTAL_FEE_TGLM: '0.1', NODE_OPTIONS: `--import=${pathToFileURL(resolve(import.meta.dirname, 'rpc-preload.mjs')).href}`, TIJORI_FIXTURE_URL: rpc.url };
function run(...args) {
 return new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--conditions=@tijori/source', '--experimental-strip-types', cli, 'arkiv', ...args], { cwd: directory, env });
  let output = '', errors = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => errors += chunk);
  child.on('error', reject); child.on('close', code => resolve({ code, output, errors }));
 });
}
try {
 await withLocalStore(async store => {
  const previous = await store.read();
  applyAction(previous.vault, 'signup', { name: 'Migration fixture', address: '0x' + '1'.repeat(40), objectName: 'fixture object', keyEnvelope: { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) } });
  await store.write(previous.vault, previous);
 }, env.LOCAL_DEMO_DATA_DIR);
 const before = await readFile(join(env.LOCAL_DEMO_DATA_DIR, 'state.json'));
 const preview = await run('migrate-local');
 assert.equal(preview.code, 0, preview.output); assert.equal(rpc.control.requests.length, 0);
 const emptyProof = await run('verify-read');
 assert.equal(emptyProof.code, 0, emptyProof.errors); assert.equal(JSON.parse(emptyProof.output).persisted, false);
 const migration = await run('migrate-local', '--write');
 assert.equal(migration.code, 0, migration.output); assert.equal(JSON.parse(migration.output).migrated, true);
 assert.equal(rpc.control.sends, 1); assert.ok(!JSON.stringify(rpc.entity()).includes('Migration fixture'));
 assert.deepEqual(await readFile(join(env.LOCAL_DEMO_DATA_DIR, 'state.json')), before);
 const duplicate = await run('migrate-local', '--write');
 assert.equal(duplicate.code, 1); assert.match((duplicate.output + duplicate.errors), /already exists/); assert.equal(rpc.control.sends, 1);
 const proof = await run('verify-read');
 assert.equal(proof.code, 0, proof.errors);
 const evidence = JSON.parse(proof.output);
 assert.equal(evidence.persisted, true); assert.equal(evidence.transactionReceiptVerified, true); assert.equal(evidence.decryptedStateValidated, true); assert.equal(rpc.control.sends, 1);
 const check = await run('check'); assert.equal(check.code, 0, check.output); assert.equal(JSON.parse(check.output).wallets, 1);
 console.log('Local → Arkiv migration: preview, encrypted write/readback, source preservation and overwrite refusal passed.');
} finally { await rpc.close(); await rm(directory, { recursive: true, force: true }); }
