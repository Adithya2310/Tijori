// Loaded ONLY by the test child process. Production code has no fixture mode.
const original = globalThis.fetch;
globalThis.fetch = (input, options) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if (new URL(url).hostname === 'rpc.rabdi.db-chain.testnet.arkiv.network') return original(process.env.TICHORI_FIXTURE_URL, options);
 return original(input, options);
};
