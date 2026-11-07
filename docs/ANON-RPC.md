# Anon RPC in Tijori

The application uses the Ethereum Foundation's `@anon-rpc/browser-harness` with the published Nym worker for **Whitechain vault dashboard reads**. No Tijori SDK release is required: the app supplies a decorated client through the published `TijoriProvider client` prop and adds status controls through `TijoriApp vaultExtras`.

## What uses Nym

Opening a Whitechain vault reads its native WBT balance, USDT balance, Safe owners, approval threshold, nonce and guard through Nym. A single worker session handles the chain check, deployment check and six remaining reads. The destination is the public Whitechain Sepolia endpoint `https://rpc.testnet.whitechain.io`, chain 1874 (`0x752`). The host constructs a fixed set of `eth_chainId`, `eth_getCode`, `eth_getBalance`, `eth_call` and `eth_getStorageAt` requests; it accepts no arbitrary methods, calldata or endpoints.

The browser verifies the chain before sending the vault address, validates JSON-RPC envelopes and ABI results, and displays the result through the SDK's normal treasury balance interface. The privacy section reports loading, success, last-loaded time and failure. Refresh or Retry changes the supplied client reference so the SDK refreshes its treasury view without leaving the selected vault. Concurrent reads for the same vault are deduplicated. There is no automatic periodic Nym polling.

Failure never falls back to the server balance endpoint or a direct destination RPC request. A previous balance may remain visible after a failed refresh; its previous load time is identified in the privacy section. The 90-second deadline includes host loading, worker resolution, network initialization and all reads. Leaving the vault or signing out cancels the session. Each refresh destroys its owning iframe and message ports, including any late bootstrap work, in addition to closing the harness.

## Privacy scope

The intended benefit is separating a vault query from the member's originating network connection at the destination RPC. Nym's documented worker routes the request through its mixnet and exits through an IP Packet Router. This reduces one source of IP/location metadata that could be associated with a member managing a valuable vault. Successful connectivity is not an independent proof of the destination-observed IP or protection from traffic correlation.

This does **not** hide public vault addresses, signer addresses, balances or transactions; undo a leaked identity; or guarantee anonymity or personal safety. Tijori's server still receives application requests. Login, object verification, Arkiv storage, approval submissions, acoustic session polling and relayer status retain their existing paths. The server independently checks chain state, signatures and balances before payment execution, using its configured normal RPC. Browser read results never authorize execution.

Ethereum worker-specifier bootstrap uses a direct connection to `https://ethereum-rpc.publicnode.com`. Bundle retrieval is also direct and can reveal the browser IP to the bootstrap/bundle services. The Nym entry network sees the originating connection. Hash verification establishes that the bundle matches the published specifier, not that its code is trustworthy. The worker never receives photos, object descriptors, passphrases, identity keys or approval signatures from this read integration.

Previously the dashboard fetched balance/configuration through Tijori's server, so its destination RPC already saw the server's IP rather than the browser IP. Nym provides an explicit mixnet route for the new browser reads and avoids using the application server for those dashboard queries.

## Configuration and code

- `lib/private-vault-client.ts`: decorates the published client, replacing dashboard `balance` calls and tracking status/cancellation. Other API methods retain their original implementation.
- `lib/anon-vault.ts`: owns the refresh frame, message channel, deadline and cancellation.
- `lib/anon-vault-host.ts`: creates the real Nym harness and sends all destination reads using `worker.fetch`.
- `lib/anon-vault-reader.ts`: sequences chain/deployment checks and the six remaining worker reads.
- `lib/anon-vault-protocol.ts`: fixed public endpoint, request plan, JSON-RPC/ABI validation and display conversion.
- `app/anon-rpc/vault-host/page.tsx`: dedicated hidden host route, outside the identity provider to avoid recursively loading it.
- `app/components/PrivateVaultReads.tsx`: provider integration and the vault privacy status/Refresh/Retry controls.

The dashboard uses the public hackathon USDT contract by default. If the server sets `TIJORI_REHEARSAL_TOKEN_ADDRESS`, the app layout passes **only that public token address** to the browser at request time; the SDK shows the rehearsal asset label. Invalid token configuration fails the read. The server-only `WHITECHAIN_RPC_URL` is never sent to the browser; it continues to configure server execution independently. This dashboard reader is specifically for public Whitechain Sepolia, not a local anvil chain or a credential-bearing RPC URL. Local storage mode continues to disable new Safe registration.

The published SDK's older Base Sepolia anonymous-balance helper is not used or modified. There are no local SDK tarballs, source aliases or SDK source changes in this integration.

## Diagnostics and validation

Open `/diagnostics/anon-rpc` without signing in. The connectivity button uses the existing chain-ID diagnostic. To exercise the **application's actual vault reader**, enter a public Whitechain Safe address and select **Read vault via Nym**. This reads public USDT regardless of a configured rehearsal token and displays the complete Safe result. No transaction or wallet connection is involved. The local failure/timeout controls exercise the older chain-ID diagnostic, not a simulated successful vault read.

`tests/anon-vault.test.mjs` checks the fixed read plan, result decoding, worker-only destination requests, stopping before vault queries on a wrong chain, invalid responses, no server-balance fallback, deduplication, retry, cancellation, frame/message validation and cleanup. Its fixtures establish application behavior, not live mixnet routing. Run `npm run build` followed by `npm test`; run `npm run lint` as well.

Live browser validation on 2026-11-07: the application vault reader returned the documented public rehearsal Safe `0x973DE604b9e867BA96D4988F7462260c5E96C394` on chain 1874 in 22,766 ms, including its public USDT balance, three owners, threshold 2, nonce and configured guard. DOM inspection found zero remaining iframes after success. This was read-only: no signup, wallet connection, signature, transaction or Arkiv write. No destination-IP measurement or anonymity audit was performed.

References: [EF wallet integration guide](https://ethereum.github.io/anon-rpc/wallets/), [Nym Anon RPC documentation](https://nym.com/docs/developers/anon-rpc), [Whitechain testnet reference](https://docs.whitechain.io/learn/network/testnet).
