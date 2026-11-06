import { env, LogLevel, type ProgressInfo } from '@huggingface/transformers';
import { DINO_MODEL, DINO_REVISION, DINO_RUNTIME_VERSION } from '@tijori/core/dino';
import { assetBaseUrl, modelsUrl, runtimeUrl } from './assets.ts';

// ONNX Runtime setup shared by the inference worker and the in-page fallback. Browser only, never used on a server.

/**
 * 'wasm' (default): everything on the CPU, with several threads on cross-origin isolated pages. 'webgpu' (opt-in):
 * SlimSAM's image encoder on WebGPU when the GPU supports 16-bit shaders, falling back to the CPU when it cannot run.
 * WebGPU is opt-in because some browsers reject ONNX Runtime's WebGPU shaders.
 */
export type ObjectAccelerator = 'webgpu' | 'wasm';
export type RuntimeChoice = { device: 'webgpu' | 'wasm'; threads: number };

/** ONNX Runtime builds: the WebGPU-capable one is larger (about 27 MB instead of 14 MB), so it is only loaded with a GPU. */
export const RUNTIME_BUILDS = { wasm: 'ort-wasm-simd-threaded', webgpu: 'ort-wasm-simd-threaded.asyncify' } as const;
export const SAM_MODEL = 'Xenova/slimsam-77-uniform';
export const SAM_REVISION = '5850ab45f587c112167512ffef949107115e26a0';
export const SAM_GPU_ENCODER = 'onnx/vision_encoder_fp16.onnx';

let configuredFor: string | undefined;
const loadedRuntime = () => (env.backends.onnx as { versions?: { web?: string } }).versions?.web ?? DINO_RUNTIME_VERSION;
function selectRuntimeBuild(device: RuntimeChoice['device']) {
 const runtime = runtimeUrl(configuredFor!, loadedRuntime()), name = RUNTIME_BUILDS[device];
 env.backends.onnx.wasm!.wasmPaths = { mjs: `${runtime}${name}.mjs`, wasm: `${runtime}${name}.wasm` };
}
/** Several CPU threads need a cross-origin isolated page (COOP + COEP headers); otherwise one thread. */
const cpuThreads = () => globalThis.crossOriginIsolated ? Math.max(1, Math.min(4, Math.ceil((globalThis.navigator?.hardwareConcurrency || 2) / 2))) : 1;

/**
 * Point transformers.js at the self-hosted assets. Called automatically before inference; the first base used wins
 * for the lifetime of the page or worker, because loaded models are cached.
 */
export function configureDinoRuntime(base: string = assetBaseUrl()) {
 if (configuredFor) return;
 configuredFor = base;
 env.allowLocalModels = false;
 // The browser fetches the pinned files from the asset host, never from an inference service.
 env.remoteHost = modelsUrl(base);
 // Pipeline metadata discovery may omit revision; every request still uses this pin.
 env.remotePathTemplate = '{model}/{revision}/';
 const originalFetch = env.fetch!;
 env.fetch = (input, init) => originalFetch(typeof input === 'string' ? input.replace(`/${DINO_MODEL}/main/`, `/${DINO_MODEL}/${DINO_REVISION}/`) : input, init);
 const wasm = env.backends.onnx.wasm!;
 wasm.numThreads = cpuThreads();
 wasm.proxy = false;
 // The WASM folder follows the ONNX Runtime build that is actually loaded (pinned through @huggingface/transformers).
 selectRuntimeBuild('wasm');
}

type GpuNavigator = { gpu?: { requestAdapter(options?: { powerPreference?: 'high-performance' }): Promise<{ features: { has(name: string): boolean } } | null> } };
const exists = async (url: string) => { try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; } };
let choice: Promise<RuntimeChoice> | undefined;
/**
 * Choose WebGPU or WASM once per page or worker, before the first model loads: the runtime build cannot change later.
 * WebGPU is used only with 16-bit shader support and when the asset host serves the GPU files (older asset folders
 * prepared without them keep working on WASM).
 */
export function prepareRuntime(base?: string, accelerator: ObjectAccelerator = 'wasm'): Promise<RuntimeChoice> {
 configureDinoRuntime(base);
 return choice ??= (async () => {
  let device: RuntimeChoice['device'] = 'wasm';
  if (accelerator === 'webgpu') try {
   const adapter = await (globalThis.navigator as GpuNavigator | undefined)?.gpu?.requestAdapter({ powerPreference: 'high-performance' });
   if (adapter?.features.has('shader-f16')) {
    const runtime = runtimeUrl(configuredFor!, loadedRuntime());
    const encoder = `${modelsUrl(configuredFor!)}${SAM_MODEL}/${SAM_REVISION}/${SAM_GPU_ENCODER}`;
    const served = await Promise.all([exists(`${runtime}${RUNTIME_BUILDS.webgpu}.wasm`), exists(encoder)]);
    if (served.every(Boolean)) device = 'webgpu';
   }
  } catch { /* no usable GPU: WASM */ }
  selectRuntimeBuild(device);
  return { device, threads: env.backends.onnx.wasm!.numThreads ?? 1 };
 })();
}

/** Run `work` without transformers.js error logs (for an expected, handled failure such as a GPU probe). */
export async function quietly<T>(work: () => Promise<T>): Promise<T> {
 const level = env.logLevel;
 env.logLevel = LogLevel.NONE;
 try { return await work(); } finally { env.logLevel = level; }
}

// Model downloads report to everyone waiting for them (a scan may start while a preload is still downloading).
export const loadListeners = new Set<(message: string) => void>();
const downloads = new Map<string, { loaded: number; total: number }>();
let lastPercent = -1;
export function reportDownload(info: ProgressInfo) {
 // Count the model files actually being read (from the network or the browser cache). The models load in parallel,
 // so every file has started (and the total is known) within moments.
 if ((info.status !== 'progress' && info.status !== 'done') || !info.file.endsWith('.onnx')) return;
 const key = `${info.name}/${info.file}`;
 if (info.status === 'progress') downloads.set(key, { loaded: info.loaded, total: info.total });
 else { const file = downloads.get(key); if (file) file.loaded = file.total; }
 let loaded = 0, total = 0;
 for (const file of downloads.values()) { loaded += file.loaded; total += file.total; }
 if (!total) return;
 const percent = Math.floor(loaded / total * 100);
 if (percent === lastPercent) return;
 lastPercent = percent;
 const message = percent >= 100 ? 'Models loaded. Starting them on this device…' : `Loading models on this device: ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB (${percent}%)`;
 for (const notify of loadListeners) notify(message);
}
