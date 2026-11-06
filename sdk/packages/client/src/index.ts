// @tijori/client: browser building blocks for a self-hosted Tijori backend.
// Heavy on-device runtimes load lazily: DINOv2/SlimSAM through preloadObjectModels() / extractObjectDescriptors(), and the acoustic modem
// (ggwave WASM) through loadAcousticModem() or the '@tijori/client/acoustic-modem' subpath.
export * from './api.ts';
export * from './assets.ts';
export { extractObjectFeatures, extractObjectDescriptors, preloadObjectModels, type ExtractOptions, type DescriptorOptions, type PreloadOptions, type ObjectAccelerator, type RuntimeChoice } from './object-features.ts';
export { CENTRE, GUIDE_FRACTION, OBJECT_NOT_FOUND, PATCH_GRID, poolForeground, FOREGROUND_COVERAGE, guideDisc, regionAt, squareCrop, rasterizeBrush, brushPrompts, chooseBrushedMask, regionTouching, validBrush, type ObjectScanResult, type ObjectBrush, type BrushStroke } from './object-geometry.ts';
export type { ObjectPoint } from './object-geometry.ts';
export * from './dino-wallet.ts';
export * from './device-identities.ts';
export * from './session-signer.ts';
export * from './safe-client.ts';
export * from './anon-rpc-protocol.ts';
export { requestViaNym, readAnonymousBalance } from './anon-rpc.ts';
export { startAnonRpcHost } from './anon-rpc-host.ts';
export type AcousticModem = typeof import('./acoustic-modem.ts');
/** Load the acoustic modem (ggwave, about 150 KB with its WASM) on demand. */
export const loadAcousticModem = (): Promise<AcousticModem> => import('./acoustic-modem.ts');
