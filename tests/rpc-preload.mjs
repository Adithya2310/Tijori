// Loaded ONLY by the test child process. Production code has no fixture mode.
const original = globalThis.fetch;
globalThis.fetch = (input, options) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if (new URL(url).hostname === 'sepolia.base.org' && process.env.TIJORI_BASE_FIXTURE_URL) return original(process.env.TIJORI_BASE_FIXTURE_URL, options);
 if (new URL(url).hostname === 'rpc.rabdi.db-chain.testnet.arkiv.network') return original(process.env.TIJORI_FIXTURE_URL, options);
 return original(input, options);
};
