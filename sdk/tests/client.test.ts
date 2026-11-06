import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DINO_DIMENSIONS, DINO_PATCHES, featuresFromTokens } from '@tijori/core/dino';
import { configureAssets, assetBaseUrl, resolveAssetBase, modelsUrl, runtimeUrl, DEFAULT_ASSET_BASE_URL } from '@tijori/client/assets';
import { extractObjectDescriptors, extractObjectFeatures, preloadObjectModels } from '@tijori/client/object-features';
import { createTijoriClient, createTichoriClient, TijoriError } from '@tijori/client/api';

const features = featuresFromTokens(Float32Array.from({ length: (DINO_PATCHES + 1) * DINO_DIMENSIONS }, (_, i) => (i % 7) + 1), [1, DINO_PATCHES + 1, DINO_DIMENSIONS]);
type Listener = ((event: { data: unknown }) => void) | null;
/** Minimal stand-in for a module Worker that answers each posted job with the given script. */
function fakeWorker(script: (worker: FakeWorker, job: unknown) => void) {
 const created: FakeWorker[] = [];
 return { created, factory: () => { const worker = new FakeWorker(script); created.push(worker); return worker as unknown as Worker; } };
}
class FakeWorker {
 onmessage: Listener = null; onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null; onmessageerror: (() => void) | null = null;
 terminated = false; jobs: unknown[] = [];
 script: (worker: FakeWorker, job: unknown) => void;
 constructor(script: (worker: FakeWorker, job: unknown) => void) { this.script = script; }
 postMessage(job: unknown) { this.jobs.push(job); queueMicrotask(() => this.script(this, job)); }
 terminate() { this.terminated = true; }
 send(data: unknown) { if (!this.terminated) this.onmessage?.({ data }); }
}

test('asset URLs resolve against the page and keep a trailing slash', () => {
 assert.equal(assetBaseUrl(), DEFAULT_ASSET_BASE_URL);
 assert.equal(resolveAssetBase('/tijori-assets', 'https://dao.example/app/page'), 'https://dao.example/tijori-assets/');
 assert.equal(resolveAssetBase('assets/', 'https://dao.example/app/page'), 'https://dao.example/app/assets/');
 assert.equal(resolveAssetBase('https://cdn.example/t/', 'https://dao.example/'), 'https://cdn.example/t/');
 assert.equal(modelsUrl('https://cdn.example/t'), 'https://cdn.example/t/models/');
 assert.equal(runtimeUrl('https://cdn.example/t/', '1.2.3'), 'https://cdn.example/t/runtime/1.2.3/');
 configureAssets({ assetBaseUrl: 'https://cdn.example/models' });
 assert.equal(assetBaseUrl(), 'https://cdn.example/models/');
 configureAssets({ assetBaseUrl: DEFAULT_ASSET_BASE_URL });
});

test('object features come from the worker, which receives the resolved asset base and is terminated', async () => {
 const progress: string[] = [];
 const { created, factory } = fakeWorker(worker => { worker.send({ status: 'progress', message: 'Loading' }); worker.send({ status: 'complete', features }); });
 const result = await extractObjectFeatures(new Blob(['photo']), { workerFactory: factory, assetBaseUrl: 'https://cdn.example/a', point: { x: 0.5, y: 0.5 }, onProgress: m => progress.push(m) });
 assert.deepEqual(result, features);
 assert.deepEqual(progress, ['Loading']);
 const job = created[0].jobs[0] as { assetBaseUrl: string; point: unknown };
 assert.equal(job.assetBaseUrl, 'https://cdn.example/a/');
 assert.deepEqual(job.point, { x: 0.5, y: 0.5 });
 assert.equal(created[0].terminated, true);
});

test('worker failures fall back to the page once; aborts and stalls reject and stop the worker', async () => {
 let fallbacks: string[] = [];
 const failing = fakeWorker(worker => worker.onerror?.({ message: 'blocked by CSP', preventDefault() {} }));
 const controller = new AbortController();
 const pending = extractObjectFeatures(new Blob(['photo']), { workerFactory: failing.factory, signal: controller.signal, onFallback: reason => { fallbacks.push(reason); controller.abort(); } });
 await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
 assert.deepEqual(fallbacks, ['blocked by CSP']);
 assert.equal(failing.created[0].terminated, true);

 fallbacks = [];
 const silent = fakeWorker(() => {});
 await assert.rejects(extractObjectFeatures(new Blob(['photo']), { workerFactory: silent.factory, stallTimeoutMs: 20, workerStartupTimeoutMs: 10_000, onFallback: r => fallbacks.push(r) }), /No model download or processing progress/);
 assert.equal(silent.created[0].terminated, true);
 assert.deepEqual(fallbacks, []);

 const aborted = new AbortController(); aborted.abort();
 await assert.rejects(extractObjectFeatures(new Blob(['photo']), { workerFactory: () => { throw new Error('must not start'); }, signal: aborted.signal }), (error: Error) => error.name === 'AbortError');
});

test('scanner v2 keeps one warm worker per page: preload, queued scans, cancellation and clear errors', async () => {
 const unit = Array(384).fill(1 / Math.sqrt(384));
 const scan = { descriptor: { cls: unit, fg: unit }, objectFraction: 0.2, foregroundPatches: 40 };
 type Job = { id: number; mode: string; image?: Blob; assetBaseUrl?: string };
 const { created, factory } = fakeWorker((worker, raw) => {
  const job = raw as Job;
  if (job.mode === 'cancel') return;
  if (job.mode === 'preload') {
   worker.send({ id: job.id, status: 'progress', message: 'Loading models on this device: 1.0 / 2.0 MB (50%)' });
   worker.send({ id: job.id, status: 'complete', runtime: { device: 'wasm', threads: 4 } });
   return;
  }
  void job.image!.text().then(text => {
   if (text === 'hold') return;
   if (text === 'none') worker.send({ id: job.id, status: 'error', message: 'No object found inside the circle.' });
   else if (text === 'crash') worker.send({ id: job.id, status: 'error', message: 'out of memory' });
   else { worker.send({ id: job.id, status: 'progress', message: `Reading ${text}` }); worker.send({ id: job.id, status: 'complete', result: scan }); }
  });
 });
 const loading: string[] = [];
 assert.deepEqual(await preloadObjectModels({ workerFactory: factory, assetBaseUrl: 'https://cdn.example/m', onProgress: m => loading.push(m) }), { device: 'wasm', threads: 4 });
 assert.deepEqual(loading, ['Loading models on this device: 1.0 / 2.0 MB (50%)']);
 assert.equal((created[0].jobs[0] as Job).assetBaseUrl, 'https://cdn.example/m/');
 assert.deepEqual(await preloadObjectModels({ workerFactory: factory }), { device: 'wasm', threads: 4 }, 'one preload per page');

 const progress: string[] = [], indexes: number[] = [];
 const results = await extractObjectDescriptors([new Blob(['a']), new Blob(['b'])], { workerFactory: factory, onProgress: m => progress.push(m), onResult: i => indexes.push(i) });
 assert.equal(results.length, 2); assert.deepEqual(indexes, [0, 1]); assert.deepEqual(progress, ['Reading a', 'Reading b']);
 assert.equal(created.length, 1, 'the preloaded worker is reused'); assert.equal(created[0].terminated, false);
 const ids = (created[0].jobs as Job[]).map(job => job.id);
 assert.equal(new Set(ids).size, ids.length, 'every job has its own id');

 await assert.rejects(extractObjectDescriptors([new Blob(['none'])], { workerFactory: factory, onFallback: () => assert.fail('no fallback for a missing object') }), /No object found/);
 const controller = new AbortController();
 const held = extractObjectDescriptors([new Blob(['hold'])], { workerFactory: factory, signal: controller.signal });
 await new Promise(resolve => setTimeout(resolve, 5));
 controller.abort();
 await assert.rejects(held, (error: Error) => error.name === 'AbortError');
 const cancel = (created[0].jobs as Job[]).at(-1)!;
 assert.equal(cancel.mode, 'cancel'); assert.equal(cancel.id, (created[0].jobs as Job[]).at(-2)!.id);
 assert.equal(created[0].terminated, false, 'cancelling keeps the models loaded');
 assert.equal((await extractObjectDescriptors([new Blob(['c'])], { workerFactory: factory })).length, 1);

 // Any other worker failure: this call moves to the page, and the next call starts a fresh worker.
 const fallback = new AbortController(), reasons: string[] = [];
 await assert.rejects(extractObjectDescriptors([new Blob(['crash'])], { workerFactory: factory, signal: fallback.signal, onFallback: reason => { reasons.push(reason); fallback.abort(); } }), (error: Error) => error.name === 'AbortError');
 assert.deepEqual(reasons, ['out of memory']); assert.equal(created[0].terminated, true);
 assert.equal((await extractObjectDescriptors([new Blob(['d'])], { workerFactory: factory })).length, 1);
 assert.equal(created.length, 2);
});

test('API client: v1 paths, percent-encoded queries, keepalive cancels and typed errors', async () => {
 const calls: { url: string; init?: RequestInit }[] = [];
 const client = createTijoriClient({ baseUrl: 'https://dao.example/api/tijori/v1/', fetch: async (input, init) => {
  calls.push({ url: String(input), init });
  if (String(input).includes('relayer')) return new Response('<html>', { status: 502 });
  if (String(input).includes('balance')) return Response.json({ error: 'Storage offline.' }, { status: 503 });
  return Response.json({ session: null, identities: [], storageMode: 'memory', invoice: { id: 'i' } });
 } });
 await client.proximity.status('group 1', 'wallet&2');
 assert.equal(calls[0].url, 'https://dao.example/api/tijori/v1/proximity?groupId=group%201&walletId=wallet%262');
 await client.proximity.start('g', 'w', 'op-1');
 assert.equal((calls[1].init?.headers as Record<string, string>)['Idempotency-Key'], 'op-1');
 assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { action: 'start', groupId: 'g', walletId: 'w' });
 await client.proximity.cancel('g', 'w', 's', { keepalive: true });
 assert.equal(calls[2].init?.keepalive, true);
 await client.objectIdentities();
 assert.equal(calls[3].url, 'https://dao.example/api/tijori/v1/object-identities');
 assert.deepEqual(await client.invoiceReceipt('i'), { id: 'i' });
 assert.equal(client.exportUrl('v 1', 'me'), 'https://dao.example/api/tijori/v1/treasury/export?vaultId=v%201&identityId=me');
 await assert.rejects(client.balance('v'), (error: TijoriError) => error instanceof TijoriError && error.status === 503 && error.message === 'Storage offline.');
 await assert.rejects(client.relayer(), (error: TijoriError) => error.status === 502 && /invalid response/.test(error.message));
 assert.equal(createTichoriClient, createTijoriClient, 'deprecated alias still works');
});

test('vendored ggwave is an ES module without Node require() calls', async () => {
 const source = await readFile(new URL('../packages/client/src/vendor/ggwave.js', import.meta.url), 'utf8');
 const code = source.split('\n').filter(line => !line.startsWith('//')).join('\n');
 assert.doesNotMatch(code, /\brequire\(/);
 assert.match(code, /export default ggwave_factory;\s*$/);
 assert.match(source, /sha256 f3792b5c185345a35a935ca68a5064b97f979d13fbba0062ff16f6b3b31a6113/);
});

test('packages with third-party code ship the same notices as the repository', async () => {
 const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
 for (const pkg of ['core', 'client']) assert.equal(await read(`../packages/${pkg}/THIRD_PARTY_NOTICES.md`), await read('../../THIRD_PARTY_NOTICES.md'), `run: cp THIRD_PARTY_NOTICES.md packages/${pkg}/`);
});
