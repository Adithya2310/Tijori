import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, readFile, rename, copyFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION } from '../lib/dino.ts';

// Public model artifacts only. Never copy env files, recovery files or application state.
export const modelFiles = [
 {name:'config.json',size:69989,model:'Xenova/mobilevit-xx-small',revision:'7dce9340b0bdd8d21f013ebbaa5206979c573ad1',gitBlob:'6be34228ff7d20eab59807a10cf6a56325d65838'},
 {name:'preprocessor_config.json',size:403,model:'Xenova/mobilevit-xx-small',revision:'7dce9340b0bdd8d21f013ebbaa5206979c573ad1',gitBlob:'5617155e1d587882708c81c2cda117c298aa6669'},
 {name:'onnx/model.onnx',size:5394387,model:'Xenova/mobilevit-xx-small',revision:'7dce9340b0bdd8d21f013ebbaa5206979c573ad1',sha256:'70ff03c7139378ae036aa4ef2629b90a483da4b5697eb094d05a812e719fbd01'},
 {"name": "config.json", "size": 379, "model": "Xenova/slimsam-77-uniform", "revision": "5850ab45f587c112167512ffef949107115e26a0", "gitBlob": "b69eda4ef734658139fd9d27f35a1a16130ef8cf"},
 {"name": "onnx/prompt_encoder_mask_decoder_quantized.onnx", "size": 4903810, "model": "Xenova/slimsam-77-uniform", "revision": "5850ab45f587c112167512ffef949107115e26a0", "sha256": "cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2"},
 {"name": "onnx/vision_encoder_quantized.onnx", "size": 8882165, "model": "Xenova/slimsam-77-uniform", "revision": "5850ab45f587c112167512ffef949107115e26a0", "sha256": "cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971"},
 {"name": "preprocessor_config.json", "size": 466, "model": "Xenova/slimsam-77-uniform", "revision": "5850ab45f587c112167512ffef949107115e26a0", "gitBlob": "732fbaf0c512b97d8d9161f51bc157bfb2873d12"},
 { name: 'config.json', size: 899, gitBlob: 'a1c56096127d92e96cfcdab9e7b9b1935686b3ec' },
 { name: 'preprocessor_config.json', size: 436, gitBlob: 'ff5b47c2edcd1d3556d63c01a65d93b58b9efce1' },
 { name: 'onnx/model.onnx', size: 88_459_888, sha256: '83141175ec78b4ff9a2bb58a4c7c264ba0054d1c2e122e5a8114b79a8d4179ea' },
];
export async function validModelFile(path, expected) {
 try {
  if ((await stat(path)).size !== expected.size) return false;
  const hash = createHash(expected.sha256 ? 'sha256' : 'sha1');
  if (expected.gitBlob) hash.update(`blob ${expected.size}\0`);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === (expected.sha256 || expected.gitBlob);
 } catch { return false; }
}

export async function prepareDinoAssets() {
 const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
 const assets = join(root, 'public', 'dino-assets');
 const modelDirectory = join(assets, 'models', DINO_MODEL, DINO_REVISION);
 for (const file of modelFiles) {
  const destination = join(assets,'models',file.model||DINO_MODEL,file.revision||DINO_REVISION,file.name);
  if (await validModelFile(destination, file)) continue;
  await mkdir(dirname(destination), { recursive: true });
  const partial = destination + '.part';
  if (!(await validModelFile(partial, file))) {
   console.log(`Caching DINOv2 ${file.name} (${(file.size / 1e6).toFixed(1)} MB) on the laptop…`);
   const child = spawn('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '15', '--max-time', '900', '--continue-at', '-', '--output', partial, `https://huggingface.co/${file.model||DINO_MODEL}/resolve/${file.revision||DINO_REVISION}/${file.name}`], { stdio: 'inherit' });
   let last = -1;
   const timer = setInterval(async () => {
    try { const percent = Math.floor((await stat(partial)).size / file.size * 10) * 10; if (percent > last) { last = percent; console.log(`DINOv2 ${file.name}: ${percent}%`); } } catch {}
   }, 10_000);
   try {
    const code = await new Promise((resolveDone, reject) => { child.once('exit', resolveDone); child.once('error', reject); });
    if (code !== 0) throw Error('Model download failed. Run npm run dino:prepare again to resume it.');
   } finally { clearInterval(timer); }
  }
  if (!(await validModelFile(partial, file))) { await rm(partial, { force: true }); throw Error(`DINOv2 checksum mismatch for ${file.name}; the file was not published.`); }
  await rename(partial, destination);
 }
 const require = createRequire(import.meta.url);
 const runtimeRoot = dirname(dirname(require.resolve('onnxruntime-web')));
 const runtimePackage = JSON.parse(await readFile(join(runtimeRoot, 'package.json'), 'utf8'));
 if (runtimePackage.version !== DINO_RUNTIME_VERSION) throw Error('ONNX Runtime version changed. Update the pinned DINO runtime assets before building.');
 const runtimeDirectory = join(assets, 'runtime', DINO_RUNTIME_VERSION);
 await mkdir(runtimeDirectory, { recursive: true });
 for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) await copyFile(join(runtimeRoot, 'dist', name), join(runtimeDirectory, name));
 await copyFile(join(root, 'scripts/licenses/onnxruntime.txt'), join(runtimeDirectory, 'LICENSE.txt'));
 await copyFile(join(root, 'scripts/licenses/dinov2.txt'), join(modelDirectory, 'LICENSE.txt'));
 await copyFile(join(root,'scripts/licenses/dinov2.txt'),join(assets,'models','Xenova/slimsam-77-uniform','5850ab45f587c112167512ffef949107115e26a0','LICENSE.txt'));
 await copyFile(join(root,'scripts/licenses/mobilevit.txt'),join(assets,'models','Xenova/mobilevit-xx-small','7dce9340b0bdd8d21f013ebbaa5206979c573ad1','LICENSE.txt'));
 console.log('DINOv2, SlimSAM and WASM runtime are ready to serve locally.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 prepareDinoAssets().catch(error => { console.error(error.message); process.exitCode = 1; });
}
