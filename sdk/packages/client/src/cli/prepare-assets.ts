#!/usr/bin/env node
// tijori-client prepare-assets [directory]
// Downloads the pinned, checksum-verified DINOv2 and SlimSAM model files and copies the matching ONNX Runtime WASM
// into a static directory (default ./public/tijori-assets) that the browser loads them from. Resumable.
// Public model artifacts only. Never copy env files, recovery files or application state into this directory.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION } from '@tijori/core/dino';

// Keep in sync with on-device-runtime.ts (that module is browser-only).
const SAM_MODEL = 'Xenova/slimsam-77-uniform', SAM_REVISION = '5850ab45f587c112167512ffef949107115e26a0';
export type ModelFile = { name: string; size: number; model?: string; revision?: string; sha256?: string; gitBlob?: string };
export const modelFiles: ModelFile[] = [
 { name: 'config.json', size: 379, model: SAM_MODEL, revision: SAM_REVISION, gitBlob: 'b69eda4ef734658139fd9d27f35a1a16130ef8cf' },
 { name: 'onnx/prompt_encoder_mask_decoder_quantized.onnx', size: 4_903_810, model: SAM_MODEL, revision: SAM_REVISION, sha256: 'cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2' },
 { name: 'onnx/vision_encoder_quantized.onnx', size: 8_882_165, model: SAM_MODEL, revision: SAM_REVISION, sha256: 'cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971' },
 { name: 'preprocessor_config.json', size: 466, model: SAM_MODEL, revision: SAM_REVISION, gitBlob: '732fbaf0c512b97d8d9161f51bc157bfb2873d12' },
 // SlimSAM's image encoder at 16-bit precision, used instead of the 8-bit one on devices with WebGPU.
 { name: 'onnx/vision_encoder_fp16.onnx', size: 12_170_657, model: SAM_MODEL, revision: SAM_REVISION, sha256: '11aaeb49c75e7b3f4cbf8a32c2c819406520c6b3affb4068ff474b2240c8aa38' },
 { name: 'config.json', size: 899, gitBlob: 'a1c56096127d92e96cfcdab9e7b9b1935686b3ec' },
 { name: 'preprocessor_config.json', size: 436, gitBlob: 'ff5b47c2edcd1d3556d63c01a65d93b58b9efce1' },
 // DINOv2 at 8-bit precision (descriptors within 0.01 of the 88 MB full-precision model).
 { name: 'onnx/model_quantized.onnx', size: 24_451_943, sha256: '3afdc8bc63b50558d6e5770f5b799bb82455c2311183a2de43803f343a29d917' },
];
// The plain build runs on the CPU; the asyncify build adds WebGPU and is only downloaded by browsers that use it.
const RUNTIME_FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

export async function validModelFile(path: string, expected: Pick<ModelFile, 'size' | 'sha256' | 'gitBlob'>) {
 try {
  if ((await stat(path)).size !== expected.size) return false;
  const hash = createHash(expected.sha256 ? 'sha256' : 'sha1');
  if (expected.gitBlob) hash.update(`blob ${expected.size}\0`);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === (expected.sha256 || expected.gitBlob);
 } catch { return false; }
}
const sizeOf = async (path: string) => { try { return (await stat(path)).size; } catch { return 0; } };

/** Download one file to `partial`, resuming with an HTTP Range request when a partial download exists. */
async function download(url: string, partial: string, expectedSize: number, label: string, log: (line: string) => void) {
 for (let attempt = 1; attempt <= 4; attempt++) {
  let offset = await sizeOf(partial);
  if (offset > expectedSize) { await rm(partial, { force: true }); offset = 0; }
  try {
   const response = await fetch(url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, redirect: 'follow', signal: AbortSignal.timeout(900_000) });
   if (response.status === 416) return;
   if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
   const append = offset > 0 && response.status === 206;
   let received = append ? offset : 0, reported = -1;
   const counter = new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    received += chunk.length;
    const percent = Math.floor(received / expectedSize * 10) * 10;
    if (expectedSize > 1e6 && percent > reported) { reported = percent; log(`${label}: ${percent}%`); }
    controller.enqueue(chunk);
   } });
   await pipeline(Readable.fromWeb(response.body.pipeThrough(counter) as import('node:stream/web').ReadableStream), createWriteStream(partial, { flags: append ? 'a' : 'w' }));
   return;
  } catch (error) {
   if (attempt === 4) throw new Error(`Download failed for ${label} (${error instanceof Error ? error.message : error}). Run prepare-assets again to resume.`);
   await new Promise(r => setTimeout(r, 2_000 * attempt));
  }
 }
}

/** Locate the onnxruntime-web that @huggingface/transformers actually loads (it pins an exact version). */
function onnxRuntimeRoot() {
 const fromHere = createRequire(import.meta.url);
 const transformers = fromHere.resolve('@huggingface/transformers');
 const main = createRequire(transformers).resolve('onnxruntime-web');
 return dirname(dirname(main));
}

export async function prepareAssets(directory = join(process.cwd(), 'public', 'tijori-assets'), log: (line: string) => void = console.log) {
 const assets = resolve(directory);
 const licenses = fileURLToPath(new URL('../../licenses/', import.meta.url));
 for (const file of modelFiles) {
  const model = file.model ?? DINO_MODEL, revision = file.revision ?? DINO_REVISION;
  const destination = join(assets, 'models', model, revision, file.name);
  if (await validModelFile(destination, file)) continue;
  await mkdir(dirname(destination), { recursive: true });
  const partial = destination + '.part';
  if (!(await validModelFile(partial, file))) {
   log(`Downloading ${model} ${file.name} (${(file.size / 1e6).toFixed(1)} MB)…`);
   await download(`https://huggingface.co/${model}/resolve/${revision}/${file.name}`, partial, file.size, `${model} ${file.name}`, log);
  }
  if (!(await validModelFile(partial, file))) { await rm(partial, { force: true }); throw new Error(`Checksum mismatch for ${model} ${file.name}; the file was not published.`); }
  await rename(partial, destination);
 }
 const runtimeRoot = onnxRuntimeRoot();
 const runtimeVersion: string = JSON.parse(await readFile(join(runtimeRoot, 'package.json'), 'utf8')).version;
 if (runtimeVersion !== DINO_RUNTIME_VERSION) throw new Error(`ONNX Runtime ${runtimeVersion} does not match the pinned ${DINO_RUNTIME_VERSION}. Reinstall @tijori/client so its exact @huggingface/transformers pin is used.`);
 const runtimeDirectory = join(assets, 'runtime', runtimeVersion);
 await mkdir(runtimeDirectory, { recursive: true });
 for (const name of RUNTIME_FILES) await copyFile(join(runtimeRoot, 'dist', name), join(runtimeDirectory, name));
 await copyFile(join(licenses, 'onnxruntime.txt'), join(runtimeDirectory, 'LICENSE.txt'));
 await copyFile(join(licenses, 'dinov2.txt'), join(assets, 'models', DINO_MODEL, DINO_REVISION, 'LICENSE.txt'));
 await copyFile(join(licenses, 'dinov2.txt'), join(assets, 'models', SAM_MODEL, SAM_REVISION, 'LICENSE.txt'));
 const manifest = { version: 2, models: [{ id: DINO_MODEL, revision: DINO_REVISION, files: modelFiles.filter(file => !file.model).map(file => file.name) }, { id: SAM_MODEL, revision: SAM_REVISION, files: modelFiles.filter(file => file.model === SAM_MODEL).map(file => file.name) }], runtime: { package: 'onnxruntime-web', version: runtimeVersion, files: RUNTIME_FILES } };
 await writeFile(join(assets, 'tijori-assets.json'), JSON.stringify(manifest, null, 1) + '\n');
 log(`DINOv2, SlimSAM and the WASM runtime are ready in ${assets}. Serve this directory as static files.`);
 return manifest;
}

// npm bin shims are symlinks, so compare real paths.
const invokedDirectly = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invokedDirectly) {
 const args = process.argv.slice(2);
 if (args[0] === 'prepare-assets') args.shift();
 if (args[0] === '--help' || args[0] === '-h') console.log('Usage: tijori-client prepare-assets [directory]   (default: ./public/tijori-assets)');
 else prepareAssets(args[0]).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
