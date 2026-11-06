import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validModelFile } from '@tijori/client/cli/prepare-assets';

test('model asset validation rejects incomplete, changed and missing downloads', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'tijori-model-test-'));
 try {
  const path = join(directory, 'model.onnx'), contents = Buffer.from('synthetic model fixture');
  const expected = { size: contents.length, sha256: createHash('sha256').update(contents).digest('hex') };
  assert.equal(await validModelFile(path, expected), false);
  await writeFile(path, contents.subarray(0, -1));
  assert.equal(await validModelFile(path, expected), false);
  await writeFile(path, Buffer.alloc(contents.length));
  assert.equal(await validModelFile(path, expected), false);
  await writeFile(path, contents);
  assert.equal(await validModelFile(path, expected), true);
  const gitBlob = createHash('sha1').update(`blob ${contents.length}\0`).update(contents).digest('hex');
  assert.equal(await validModelFile(path, { size: contents.length, gitBlob }), true);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
