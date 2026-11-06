# Anon RPC in Tijori

Anon RPC defines a sandboxed worker interface, not an anonymity network by itself. The optional Safe balance check uses the published Nym worker through `@anon-rpc/browser-harness`. The browser directly reads the worker specifier on Ethereum mainnet and resolves the worker bundle, verifies its hash, then starts it in a sandbox. The selected published worker is intended to route the Base Sepolia `eth_getBalance` request through Nym; this has not been independently verified by observing exit traffic. The RPC endpoint receives the Safe address. A successful response alone does not establish what source IP the endpoint observed. The entry network can see the user's IP; anonymity depends on the worker, network and threat model. Hash verification establishes the bundle matches the specifier, not that it is trustworthy. The bootstrap RPC and bundle host may see the browser IP. Availability and performance depend on external services.

Open a registered Safe and select **Check balance via Anon RPC**. It can take time to initialize; failure does not fall back to a direct request. The existing balance and signer display still uses the server's normal RPC. This optional check requires a browser with the necessary WebRTC/network access and uses public endpoints without an SLA. It is a prototype, not an independently verified privacy guarantee.

## Scope and limitations

- Sign-in and object verification send requests directly to the Tijori server; the current app is local and object verification is simulated. If hosted remotely, the server or its infrastructure can see client IPs. Anon RPC does not protect these requests.
- Wallet deployment, Safe app operations, Arkiv writes, ordinary server-side Safe reads, page loading, DNS, bootstrap and bundle retrieval are outside this integration. The connected wallet controls its own network traffic.
- Ethereum addresses, RPC payloads, on-chain transactions, timing and other identifiers can correlate activity even when the destination does not see the original IP. IP geolocation is approximate and is only one possible location signal.
- Routing sign-in through a general anonymous transport would require a separately designed and tested architecture, including reachability of the application API, protection against correlation, operational abuse controls and a threat model. The paid-write API is unauthenticated and must not be exposed publicly. Do not route credentials or object data through an unreviewed worker or claim private sign-in based on this demo.
- The extension harness targets browser extensions and is not needed by this web app. The reference passthrough worker offers no anonymity.

References: https://ethereum.github.io/anon-rpc/wallets/ and https://ethereum.github.io/anon-rpc/networks/.


## Isolated connectivity diagnostic

Open `/diagnostics/anon-rpc` (also linked from sign-in and the dashboard). No identity, Arkiv configuration, wallet, or funds are needed. Whitechain is **not integrated**: the target is only a read-only connectivity fixture, separate from Safe deployment, balances, identity, API providers, and storage.

The intended path is application → `@anon-rpc/browser-harness` → published Nym worker/mixnet → Whitechain testnet RPC → application. There is no passthrough worker or direct target fallback. Only `eth_chainId` and latest `eth_getBalance` are accepted by the reusable transport boundary.

### Endpoint verification (2026-11-06)

- Current official [Whitechain testnet reference](https://docs.whitechain.io/learn/network/testnet) and [developer guide](https://whitechain.io/blog/start-building-on-whitechain) identify **Whitechain Sepolia**, RPC `https://rpc.testnet.whitechain.io`, chain ID **1874 / `0x752`**. The separate explorer is `https://explorer.testnet.whitechain.io/`.
- A separate, explicit read-only command-line `eth_chainId` verification returned `{"jsonrpc":"2.0","result":"0x752","id":1}`. This direct verification is not an application fallback and does not test Nym routing.
- Older wallet documentation and chain registries list `https://rpc-testnet.whitechain.io` / 2625 (`0xa41`); those describe a different/legacy testnet. Do not substitute it silently. Ankr's generic Whitechain URL also must not be assumed to be testnet.
- [Nym's official documentation](https://nym.com/docs/developers/anon-rpc) and [EF adopters list](https://ethereum.github.io/anon-rpc/adopters/) publish specifier `0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0` on Ethereum mainnet. The existing Nym worker is used, with empty configuration; no custom anonymizing network or Whitechain adapter is implemented.

### Controls and lifecycle

- **Run connectivity test** sends `eth_chainId` with no parameters through Nym and verifies the returned quantity equals `0x752`. HTTP, JSON-RPC, malformed envelope/quantity, wrong chain, bootstrap, and worker errors are surfaced. The 90-second deadline includes host loading, bundle import/resolution, network initialization, fetch, and response parsing.
- **Test bootstrap failure** constructs the real Nym harness but deliberately rejects its bootstrap provider before any external request. This is a local fault injection, not evidence that the destination or mixnet is reachable.
- **Test timeout** uses a local non-responding host fixture and a one-second deadline. It sends no bootstrap or destination request. It exercises the same parent deadline and cleanup used by a real run.
- **Cancel** and page unmount abort the session. Buttons prevent overlapping runs. Each run closes the harness and message ports and removes its owning frame, on success, failure, cancellation, or timeout.

The extra owning frame is intentional: inspection of browser-harness 0.4.0 showed that `close()` does not prevent an outstanding specifier/bundle bootstrap from later creating its inner iframe. Destroying the entire owning browsing context also disposes late bootstrap work and nested workers. Messages are checked against the expected frame/parent, same origin, and a per-run MessageChannel; the worker retains the harness's null-origin sandbox. The same-origin outer host is lifecycle containment, not an additional security sandbox.

`@tijori/client/anon-rpc` (`packages/client/src/anon-rpc.ts`) exposes `requestViaNym` for later chain integration; pass `hostUrl` when the host page is not at `/diagnostics/anon-rpc/host`. `@tijori/client/anon-rpc-protocol` owns read validation and the diagnostic-only testnet constant. The host page calls `startAnonRpcHost()` (`packages/client/src/anon-rpc-host.ts`), which owns the actual harness and explicit direct Ethereum bootstrap (15-second request limit). It does not call Tijori's paid-write API. No credentials, identity keys, or object data are sent. Nym/gateway availability, WebRTC policies, CSP, bundle resolvers, and Ethereum bootstrap may block the flow; errors never enable a direct destination request.

Unit tests cover allowed reads, JSON-RPC validation, chain mismatch, session success/failure/deadline/cancellation cleanup and absence of direct fetch in the application transport. These use local fixtures and do not establish live anonymity.

### Observed validation (2026-11-06)

- `npm run lint`, `npm run build`, and then `npm test`: passed (18 unit tests plus the isolated API/SDK integration fixture).
- Production build served only on loopback for browser testing. Live Nym-harness `eth_chainId` returned `0x752` / 1874 in **23,979 ms**. No live-flow blocker was observed in this browser/network on this attempt.
- Local bootstrap-failure control surfaced its deliberate error in 56 ms; timeout control surfaced its deadline at 1,002 ms. A separate live attempt was cancelled at 5,869 ms and displayed cancellation.
- Browser DOM inspection found **zero remaining iframes** after live success and cancellation. Unit fixtures cover disposal after failure and timeout as well.
- No transaction, wallet connection, signup, funds, or real Arkiv write was used for this diagnostic. The integration suite used its existing local RPC fixture and throwaway state.
- This validates connectivity through the configured harness interface, not independently observed mixnet routing or the destination's source IP. No exit-IP comparison, packet capture, or anonymity audit was performed. Bootstrap and bundle hosts still see direct traffic.
