# Tichori

A local prototype for object-based demo identities and group transaction approvals. Application records persist as an encrypted Arkiv entity on **Rabdi, chain 7794095**, using `@arkiv-network/sdk` 1.0.1. SQLite is used only by the explicit, one-time migration command.

Identity matching, World IDs, object scans, microphone listening, proximity, group transfers and quorum execution remain simulations. Anyone with access to this local app can switch demo identities and approve. Balances remain zero placeholders. Only storage writes are real testnet transactions, paid by the configured server wallet. Do not use real credentials, personal information or funds.

## Run locally

Requires Node.js 22.20+ and a persistent writable filesystem. Bind the demo to localhost; this API has no real authentication or per-user spending authorization and must not be exposed publicly.

1. Run `npm install`.
2. Copy `.env.example` to `.env` if you do not already have a local configuration. Configure `ARKIV_WALLET_PRIVATE_KEY`, the matching `ARKIV_WALLET_ADDRESS`, and your own `ARKIV_ACCESS_KEY` from [Arkiv Hub](https://hub.arkiv.network/access-keys). Fund the wallet with test GLM.
3. Generate an independent 32-byte encryption key and store its hex form as `ARKIV_STATE_ENCRYPTION_KEY`. Back up this key privately. Never commit or publish `.env`.
4. Choose a stable `ARKIV_NAMESPACE` and an explicit `ARKIV_MAX_TOTAL_FEE_TGLM`. Zero or missing budget disables writes. The journal conservatively reserves each signed transaction's maximum fee, including uncertain writes. Raising the setting increases the cumulative allowance; restarting does not reset it. Each namespace has its own journal and allowance. Do not change namespaces to bypass a budget.
5. Run `npm run arkiv:check` for read-only connectivity, signer, funding and state checks.
6. For existing SQLite data, stop the app and run `npm run arkiv:migrate` **before the first signup**. It encrypts existing records, verifies receipt and exact state readback, preserves IDs and invitations, and leaves `data/vault.sqlite` untouched. Migration refuses to overwrite existing Arkiv state. Invalid legacy relations or duplicate codes fail validation for explicit repair.
7. Run `npm run dev -- --hostname 127.0.0.1` and open http://localhost:3000.

Without a legacy database, the first valid signup creates the entity. Login is read-only. Writes wait for a successful receipt and matching fresh Arkiv query before returning success. Group codes and object descriptions are omitted from API state, as before.

## Storage design and limits

`lib/vault.ts` preserves the demo rules and validates relationships. `lib/arkiv/store.ts` stores a named `tichori_state_v1` entity with an indexed namespace, revision, encoding and unindexed ciphertext bytes. Reads require the configured creator and owner. One encrypted aggregate makes each logical change atomic and avoids partially updated membership or approvals. It deliberately targets a small demo: serialized plaintext is capped at 100,000 bytes and exact writes must also fit the gas limits. This is not a scalable relational database replacement.

AES-256-GCM uses an independent server key, a fresh 12-byte IV, and authenticated context binding chain genesis, signer, namespace and format version. Public metadata still reveals the server wallet, namespace, revision, ciphertext length, timing and expiration. Encryption does not add real user authentication. Keep the signing wallet exclusive to this app and do not transfer the state entity.

The entity expires after **30 days** at creation. Patching does not renew expiration. Renewal, archival and restore are not automated; arrange authorized Lifetime Extension before expiration if you need longer retention. Missing, expired, transferred, duplicate, corrupted or reset state produces an error rather than an automatic empty vault. Keep encryption keys and a backup of the original SQLite source safe. Do not delete the Arkiv journal to reset the demo or its spending allowance.

`data/arkiv-<signer>-<namespace>.json` stores verified entity metadata, reserved fees and any pending signed transaction for recovery; it is not the application database. Writes fsync signed intent/hash before broadcast and preserve confirmed receipts before readback. A shared signer lock coordinates processes on one host. All processes must share `VAULT_DATA_DIR`; distributed/serverless writers and use of this wallet by other apps are unsupported.

No write is automatically resent. The next request reconciles a pending hash, verifies the mined transaction and ciphertext, and resumes without another signature. If a receipt is unavailable or reverted, writes stop for operator investigation. After a crash, confirm the process is stopped and inspect the journal before removing a stale `.lock` file. Preserve the journal and its signed bytes; never print or upload it. Idempotency keys retain the last 100 successful mutation IDs in encrypted state. Repeating a key with changed input fails. The UI reuses a pending operation ID when retrying the same input, including after a reload; it clears that ID on success. Changing the input starts a new operation.

The Arkiv MCP supplied network/schema/SDK guidance. Application reads and local signing use the SDK directly; credentials are never sent to the MCP.

## Checks

Run `npm run build` before `npm test`, then `npm run lint`. The test suite uses a local RPC fixture and a throwaway signer, encryption key and journal directory. It exercises the real SDK encoding, signed transactions, API flow, receipt recovery and error guards without spending testnet funds. Fixture results do not establish live Rabdi persistence; `arkiv:check` and an authorized migration/write with readback establish that separately. `npm run arkiv:verify` performs a paid storage update of the same vault contents with a fresh encrypted envelope and verifies the receipt and exact readback.
