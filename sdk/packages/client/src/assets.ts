// Where the browser loads the pinned DINOv2/SlimSAM models and ONNX Runtime WASM from.
// Prepare the directory with `npx tijori-client prepare-assets public/tijori-assets` and serve it as static files
// (or from your own CDN). Photos never leave the device; only these public model files are downloaded.
export const DEFAULT_ASSET_BASE_URL = '/tijori-assets/';
let configured = DEFAULT_ASSET_BASE_URL;
let accelerator: import('./on-device-runtime.ts').ObjectAccelerator = 'wasm';

/**
 * Set the asset base URL for this page (relative to the page or absolute) and, optionally, `accelerator: 'webgpu'` to
 * try WebGPU for object isolation (default 'wasm': CPU only, the most compatible). Call before the first scan or preload.
 */
export function configureAssets(options: { assetBaseUrl?: string; accelerator?: import('./on-device-runtime.ts').ObjectAccelerator }) {
 if (options.assetBaseUrl) configured = options.assetBaseUrl.endsWith('/') ? options.assetBaseUrl : options.assetBaseUrl + '/';
 if (options.accelerator === 'webgpu' || options.accelerator === 'wasm') accelerator = options.accelerator;
}
export const assetBaseUrl = () => configured;
export const objectAccelerator = () => accelerator;
/** Resolve an asset base (default: the configured one) to an absolute URL with a trailing slash. */
export function resolveAssetBase(base: string = configured, from: string = globalThis.location?.href ?? 'http://localhost/') {
 const url = new URL(base, from).href;
 return url.endsWith('/') ? url : url + '/';
}
export const modelsUrl = (base: string) => new URL('models/', resolveAssetBase(base)).href;
export const runtimeUrl = (base: string, ortVersion: string) => new URL(`runtime/${ortVersion}/`, resolveAssetBase(base)).href;
