// Node is used only by the offline evaluator. Browser pages and workers use
// the pinned local WASM assets; neither sends pixels to an inference service.
export const OBJECT_DEVICE = typeof process!=='undefined'&&!!process.versions?.node?'cpu':'wasm';
