// @tijori/client: browser building blocks for a self-hosted Tijori backend.
// Heavy on-device runtimes load lazily: DINOv2/SlimSAM through extractObjectFeatures(), and the acoustic modem
// (ggwave WASM) through loadAcousticModem() or the '@tijori/client/acoustic-modem' subpath.
export * from './api.ts';
export * from './assets.ts';
export { extractObjectFeatures, type ExtractOptions } from './object-features.ts';
export type { ObjectPoint } from './object-isolation.ts';
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
