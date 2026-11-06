# Tijori

A local prototype for demo identities and shared treasuries. New vaults are presence-guarded Safe multisig treasuries on **Whitechain Sepolia, chain 1874**, holding USDT; vaults created earlier on Base Sepolia (84532) stay readable. Vault metadata and existing demo records persist in an encrypted Arkiv entity on **Rabdi, chain 7794095**, using `@arkiv-network/sdk` 1.0.1. SQLite is used only by the explicit, one-time migration command.

## This app is a Tijori SDK merchant

The Tijori app in this repository uses the published [`@tijori/*` npm packages](https://www.npmjs.com/org/tijori) like any other integrator. It installs them from the registry and uses no local source.

```jsonc
// package.json
"@tijori/server": "^0.1.0", "@tijori/client": "^0.1.0", "@tijori/react": "^0.1.0"
```

| File | The whole integration |
|---|---|
| [`lib/tijori.ts`](lib/tijori.ts) | `export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api' })` |
| [`app/api/[...path]/route.ts`](app/api/%5B...path%5D/route.ts) | `export const { GET, POST, HEAD } = toNextHandlers(tijori)` |
| [`app/page.tsx`](app/page.tsx) | `<TijoriProvider baseUrl="/api/v1"><TijoriApp … /></TijoriProvider>` |
| [`app/layout.tsx`](app/layout.tsx) | `import '@tijori/react/styles.css'` |
| `package.json` | `"prebuild": "tijori-client prepare-assets public/tijori-assets"` |

Everything else is app-specific and plugs into `<TijoriApp/>` slots:
- [`app/legacy.tsx`](app/legacy.tsx): passphrase identities, Base Sepolia Safes and simulated transfers.
- [`PhoneAccess`](app/components/PhoneAccess.tsx): LAN phone testing.
- The Anon RPC diagnostic.

The SDK is developed in [`sdk/`](sdk). It has its own install, tests, examples and releases, and its changes reach this app only as a new npm version. To try unreleased SDK changes in the app, run `npm run sdk:try-local`, then `npm ci` to go back.

### Use Tijori in your own app
- `@tijori/server`: a self-hosted backend.
- `@tijori/client`: browser building blocks.
- `@tijori/react`: a drop-in `<TijoriApp/>` and composable components.
- `@tijori/invoices`: an SDK for vendors billing a vault.

A DAO site or marketplace can add object sign-in, gasless Whitechain vaults with co-present approvals, and acoustic attendance with one backend route and one component. See [docs/SDK.md](docs/SDK.md) and the runnable [sdk/examples/dao-site](sdk/examples/dao-site).

New identities are a username linked to a personal object: the browser computes DINOv2 descriptors of the isolated object, and the server matches the login photo against the enrolled object before releasing any key material (see "Object sign-in" below). It distinguishes different objects but is not secure authentication. Existing passphrase identities retain their original login path. Acoustic checks use real ggwave WASM, browser audio and opt-in microphone access, with sessions and matches persisted in the encrypted Arkiv aggregate. A match is a cooperative demo, not proof of physical proximity or identity; challenges can be replayed or relayed. Existing demo vaults and their requests remain simulated. New Safe vaults have real testnet contracts and signer-enforced thresholds; their transactions are handled in the Safe app, not by the demo approval flow. Anyone with access to this local app can switch demo identities. Use only testnet funds and synthetic identity information.

## Wi-Fi acoustic testing without Arkiv

For the current two-device test, set `TIJORI_STORAGE_MODE=local` in your ignored `.env.local`, then run `npm run dev:phone`. No Arkiv credentials or testnet funds are required in this mode. Open the printed HTTPS Wi-Fi URL on both devices (or `https://localhost:3443` on the laptop), on the same trusted network. Handle the local certificate warning yourself.

1. Create a different synthetic object-demo identity on each device on that device. Optional backups are under **Optional backup / move an existing identity**. Original photos and masks stay on that device. New compact feature references are saved to the selected encrypted server store; older full references remain local.
2. On one device choose **Create acoustic group**. Under **Registered people**, add the other enrolled user, enter a group name and create it. Users and groups refresh automatically every 2.5 seconds; both devices can open the same group.
3. In **Acoustic proximity check**, press **Send** on the laptop/device playing the sound. On the other device press **Join check**, allow microphone access, keep the page open and hold it near the speaker. Choose **Ultrasound broadcast** before Send for the high-frequency protocol, or leave it off for audible testing. The receiving device detects both automatically. Use device speakers, without headphones. A successful decode shows **Signal matched** on both devices’ member lists.

The laptop stores users, encrypted identity envelopes, groups, challenges and matches in `data/local-demo/state.json`, encrypted with the independent `data/local-demo/encryption.key`. Both are private Git-ignored local files. Concurrent requests/processes share an exclusive file lock; writes are atomic and synced. Restarting preserves identities/groups/matches, while two-minute challenges still expire normally. Polling never rewrites the database. Missing/corrupt initialized state or a missing key fails closed. Keep the key with the database privately; do not delete either while testing. A stopped process can leave `state.lock`; inspect it before any manual recovery.

The UI labels this **LOCAL WI-FI TEST**. The default remains Arkiv unless explicitly configured otherwise; there is no automatic fallback when Arkiv fails. Local mode makes no Arkiv calls, never uses its signer/journal/budget, and disables Safe registration. Both modes use the same v5 domain schema and acoustic protocol. Switching back to `TIJORI_STORAGE_MODE=arkiv` selects the existing separate Arkiv state; local records are not automatically migrated, merged or uploaded. SQLite remains a read-only migration source. This unauthenticated demo belongs only on a trusted test LAN. Real acoustic decoding is not proof of proximity or identity and never authorizes transactions.

## Whitechain treasury: co-present approvals for DAOs and large vaults

Tijori is a treasury for DAOs, teams and families. A payout from the vault needs a **majority of its signers, physically together in one place**, and **each approver verifies with their personal object**. On Whitechain this becomes an on-chain rule, not a UI convention:

- **The vault is a Safe 1.4.1 on Whitechain Sepolia** with a majority threshold. Its owners are the members' Tijori identity keys, which are generated and encrypted in the browser and unlocked by the person.
- **`TichoriPresenceGuard`** is installed when the Safe is created. Every execution must carry a fresh EIP-712 co-presence attestation from the vault's Tijori verifier for exactly that Safe transaction, and the threshold signers must be the attested owners. Executing from the Safe app, or any path without the attestation, reverts. A unanimous-owner escape hatch can only remove the guard or rotate the verifier.
- **Signers never touch crypto.** Approving is: show your object, have your phone hear the room code, tap Approve. That produces a free EIP-712 signature in the browser. There is no seed phrase, wallet popup, WBT or chain name. Tijori's relayer pays the gas, and **the vault refunds it in USDT** through Safe's native gas refund, capped by what the signers signed.
- **Vendors bill the treasury** through an invoice inbox: the `@tijori/invoices` SDK plus signed `invoice.paid` webhooks, a public receipt and an accountant CSV.

**Why this needs on-chain stablecoin settlement on Whitechain:**
- **What a bank or card rail can't do:** neither can enforce *who must be in the room* before money moves, refuse a payment without a co-presence proof, or let vendors and auditors verify that rule independently.
- **What Whitechain adds:** a guarded Safe holding USDT enforces the quorum and the presence attestation in the contract itself, then settles final in about 1 second for a fraction of a cent. Every payout, its approvers' attestation and its gas refund leave a public receipt nobody has to trust Tijori for.

### Architecture

```
Vendor app ──@tijori/invoices──► POST /api/v1/invoices ──► invoice inbox (encrypted Arkiv aggregate, vault v6)
Signer ──► POST /api/v1/proposals ──► POST /api/v1/approval-sessions (fixes SafeTx at live nonce, presence challenge)
Each signer in the room: object check + presence (room code) + own EIP-712 Safe signature ──► POST /api/v1/physical-approvals
Majority in ONE session ──► verifier signs CoPresence attestation ──► relayer ──► TichoriPresenceGuard.executeWithAttestation
                                                                                   └► Safe.execTransaction: USDT → vendor; USDT gas refund → relayer
Receipt: /invoice/[id] · webhook invoice.paid (HMAC) · GET /api/v1/treasury/export (CSV) · GET /api/v1/relayer (gas tank)
```

**Key files:**
- `contracts/`: the Foundry project, with `TichoriPresenceGuard`, `TichoriSafeSetup` and tests against the canonical Safe 1.4.1 bytecode read from Whitechain.
- `sdk/packages/core/src/whitechain/`: chain constants, EIP-712 helpers and the pure treasury domain. `sdk/packages/server/src/whitechain/`: the relayer (journaled, never resends), config and keys.
- `sdk/packages/server/src/services/treasury.ts`: the service behind the `/api/v1` routes.
- `sdk/packages/react/src/components/VaultTreasury.tsx`: the UI (`<VaultTreasury vaultId/>` from `@tijori/react`).
- `sdk/packages/invoices`: the vendor SDK.
- `sdk/examples/vendor-studio`: a separate vendor app, where the integration is about 20 lines.

### Deployed on Whitechain Sepolia

| Item | Address / transaction |
| --- | --- |
| TichoriPresenceGuard | [`0x117919dCBBE5E2Aed227e89dddCa2f68B399B238`](https://explorer.testnet.whitechain.io/address/0x117919dCBBE5E2Aed227e89dddCa2f68B399B238) · [deploy tx](https://explorer.testnet.whitechain.io/tx/0x87389ab1f60015c0b1186d1665b5fe1d185e4a3ba17cb36bf829e42d0d93606f) |
| TichoriSafeSetup | [`0x6905DC2c7c3cA3b2eC97A209f493e949e5bA0e54`](https://explorer.testnet.whitechain.io/address/0x6905DC2c7c3cA3b2eC97A209f493e949e5bA0e54) · [deploy tx](https://explorer.testnet.whitechain.io/tx/0xb1f64904ba712097f66e659685961136b8f65b5629b0c0e1bdd6f7f3bd1552e0) |
| **First co-present USDT payout (qualifying)** | 1 USDT (`0xcedf…f55a7`) vendor-invoice payout from the guarded 2-of-3 vault, approved by 2 signers in one session and relayed through `TichoriPresenceGuard`: [tx `0x2cc35372…`](https://explorer.testnet.whitechain.io/tx/0x2cc353722e47ed0a5450a9ecc4ae4615ddc775aa6938783b3cf4e651983cc9c5). The vault refunded 0.12233 USDT of gas to the relayer, so signers never held WBT. |
| Live rehearsal vault (2-of-3, guarded) | [`0x973DE604b9e867BA96D4988F7462260c5E96C394`](https://explorer.testnet.whitechain.io/address/0x973DE604b9e867BA96D4988F7462260c5E96C394) · [gasless deploy tx](https://explorer.testnet.whitechain.io/tx/0x1188534e1159d14d7104b53c1cdd29df746c2ad2d14df152ff117325693a4ce0) |
| Live rehearsal payout (**rUSD, not qualifying**) | 25 rUSD invoice payout approved by 2 of 3 in one session: [tx](https://explorer.testnet.whitechain.io/tx/0x6adee8cd652bc57da0058c7a631784a8277df2d8f93805df07c4568ff0e4d4c2). The vault refunded 0.112848 rUSD of gas; the guard emitted `CoPresentExecution`. The same vault rejects direct owner-signed execution with `PresenceRequired()`. |
| Source verification | Pending: Blockscout returned "Contract verification is temporarily unavailable" at deploy time. Run `npm run verify:contracts` to submit both. |
| USDT (hackathon token) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

### Set up the Whitechain treasury

**Prerequisites:** [Foundry](https://getfoundry.sh) and the Arkiv setup under "Run locally" below. Run Foundry keystore commands in your own terminal, and never paste keys into chats or commits.

1. **Prepare the contracts.** Run `git submodule update --init`, then `forge test --root contracts`.
2. **Create the deployer and relayer keys.**
   - Deployer: run `cast wallet import tichori-deployer --interactive`, then claim test WBT at https://faucet.testnet.whitechain.io.
   - Relayer: create a key with `cast wallet new` and send it some WBT from the deployer.
3. **Deploy and verify** the guard and setup hook (no owner or admin keys):
   ```bash
   cd contracts && forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account tichori-deployer \
     --broadcast --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
   ```
4. **Fill in `.env`.** Set `TIJORI_GUARD_ADDRESS` and `TIJORI_SAFE_SETUP_ADDRESS` from the script output. Set `WHITECHAIN_RELAYER_PRIVATE_KEY`, plus a separate `TIJORI_VERIFIER_PRIVATE_KEY` (`cast wallet new`, no funds). See `.env.example` for the optional limits.
5. **Start the app.** Run `npm run build && npm start -- --hostname 127.0.0.1`.
6. **Create and fund a vault.** Sign up each signer, then **Create vault**: it is gasless, and the relayer deploys the guarded Safe. Send test USDT to the vault address.
7. **Pay out.** **Propose payment** (or pay an inbox invoice), then **Start approval session**. Each signer in the room approves. At the majority, the payout executes on Whitechain.

**How the business side pays for gas, and why the relayer can't be drained:**
- **Who pays:** the relayer pays WBT, and each payout refunds it in USDT from the vault. The fee is part of the signed Safe transaction, so it can't be inflated.
- **Where the WBT comes from:** on testnet, the faucet. In production, swapping collected USDT refunds to WBT on a Whitechain DEX, or buying on WhiteBIT and moving it in through the Portal bridge.
- **What the relayer will send:**
  - It calls only the Safe factory and the guard, with ABI-built calldata.
  - Every send is simulated first, so a bad signature, a missing quorum or an empty vault costs nothing.
- **Spending limits:** there's a fee cap (`RELAYER_MAX_FEE_GWEI`), a balance floor, a daily vault-creation cap and a daily per-vault execution cap.
- **Failure handling:**
  - Transactions are journaled (fsync) before broadcast and are never resent automatically.
  - A leaked relayer key can only spend WBT. It cannot move vault funds without the owners' signatures *and* a verifier attestation.

### Rehearsing without test USDT

If you don't have the hackathon USDT yet, you can rehearse the full flow on Whitechain Sepolia with **Tichori Rehearsal Dollar (`rUSD`)**. It is a testnet-only token with open minting (`contracts/src/rehearsal/RehearsalUSD.sol`).

1. Deploy it and mint to your vault:
   ```bash
   cd contracts && MINT_TO=<vault address> forge script script/DeployRehearsalUSD.s.sol \
     --rpc-url whitechain_sepolia --account tichori-deployer --broadcast
   ```
2. Set `TIJORI_REHEARSAL_TOKEN_ADDRESS` in `.env`.

While it's set, the vault shows a **REHEARSAL TOKEN** flag and `capabilities()` reports `qualifying: false`. **Payments in it do not count for the Whitechain tracks.** Unset it, then make the README payout with the official USDT.

### Tests

- `forge test --root contracts`: 12 guard tests on the canonical Safe bytecode.
- `npm run sdk:test`: SDK unit tests plus the Arkiv API flow, run against the local package source.
- `npm test`: the app's tests, run against the published packages (`npm run build` first).
- `npm run sdk:test:whitechain`: the local SDK server against a local anvil chain (id 1874) with canonical Safe bytecode and mock USDT. It covers:
  - gasless vault creation and the vendor invoice
  - wrong object, presence or key, each rejected at zero cost
  - the guard blocking un-attested execution
  - the majority payout with a USDT gas refund
  - the signed webhook and the CSV export
  - separate sessions never combining

No testnet funds are spent by tests.

### Current limitations (honest)

- **Simulated checks:** object matching and the ultrasonic presence check are **simulated providers** in this repo.
  - The real implementations plug into `ObjectMatchingProvider` and `PresenceSessionProvider` (`sdk/packages/core/src/integrations.ts`; pass replacements as `createTijoriServer({ providers })`).
  - The UI calls `<TijoriProvider onPresenceEmit>` and emits `tijori:presence-emit` (plus the deprecated `tichori:presence-emit`). Approvers use `<TijoriProvider presence>` or `window.tijoriPresence.listen()` (`window.tichoriPresence` still works).
  - Frequency matching alone does not prove proximity: relay and replay must be handled by the real provider.
- **Simulated room code is visible to members:** in simulated presence mode, members' session listings include the room code so the flow can be demonstrated without audio. In live mode only the initiator's device receives it.
- **What a majority can still do:** the guard does not restrict *what* a co-present, attested majority approves. The server only builds USDT payouts, but the Safe would accept any attested transaction the owners sign, including adding modules. Safe 1.4.1 module transactions are not checked by transaction guards.
- **Trusted verifier:** the verifier is a trusted Tijori server key. The guard enforces that its attestation exists and matches, but cannot itself prove where anyone was.
- **No authentication yet:** the API is still unauthenticated (identity IDs are demo selectors). Bind to localhost; a phone/camera/mic demo needs an HTTPS tunnel and deliberate exposure.
- **Login:** it still asks for the public address. The identity key is unlocked with the passphrase for signing and kept in tab memory only.
- **Single instance:** this is a single-instance server, with one relayer key and one data directory.

## Reusable API and integration hooks

The frontend uses `/api/v1/*` through a typed HTTP client. The server owns request discovery, approval eligibility, quorum presentation and Safe deployment preparation, with replaceable server providers for object matching, physical approvals and external-vault verification. Existing unversioned endpoints remain compatible. Object matching and physical providers are still simulations; external-vault verification returns HTTP 501 until an adapter is implemented. Browser encryption and user wallet signing remain on the device.

See [the API integration guide](docs/API.md) for endpoint payloads, provider contracts, teammate wiring locations and the boundaries of this local scaffold. This does not add public API authentication, multi-application isolation or on-chain physical approval enforcement.

## Run locally

Requires Node.js 22.20+ and a persistent writable filesystem. Bind the demo to localhost; this API has no real authentication or per-user spending authorization and must not be exposed publicly.

1. Run `npm install`.
2. Copy `.env.example` to `.env` if you do not already have a local configuration. Configure `ARKIV_WALLET_PRIVATE_KEY`, the matching `ARKIV_WALLET_ADDRESS`, and your own `ARKIV_ACCESS_KEY` from [Arkiv Hub](https://hub.arkiv.network/access-keys). Fund the wallet with test GLM.
3. Generate an independent 32-byte encryption key and store its hex form as `ARKIV_STATE_ENCRYPTION_KEY`. Back up this key privately. Never commit or publish `.env`.
4. Choose a stable `ARKIV_NAMESPACE` and an explicit `ARKIV_MAX_TOTAL_FEE_TGLM`. Zero or missing budget disables writes. The journal conservatively reserves each signed transaction's maximum fee, including uncertain writes. Raising the setting increases the cumulative allowance; restarting does not reset it. Each namespace has its own journal and allowance. Do not change namespaces to bypass a budget.
5. Run `npm run arkiv:check` for read-only connectivity, signer, funding and state checks.
6. For existing SQLite data, stop the app and run `npm run arkiv:migrate` **before the first signup**. It encrypts existing records, verifies receipt and exact state readback, preserves IDs, invitations and optional SQLite proximity session/match history, and leaves `data/vault.sqlite` untouched. Migration refuses to overwrite existing Arkiv state. Invalid legacy relations or duplicate codes fail validation for explicit repair.
7. Run `npm run dev -- --hostname 127.0.0.1` and open http://localhost:3000.

Without a legacy database, the first valid signup creates the Arkiv entity. New signup uses the object-only experimental flow below. Existing passphrase identities can log in using **Use existing passphrase identity**: their AES-256-GCM envelopes remain protected by PBKDF2-SHA256 with 600,000 iterations and a random salt. Plaintext identity keys and user passphrases never go to the API or browser storage. The unauthenticated server does not enforce the browser check. On Whitechain vaults the identity key is the Safe signer: it signs approvals in the browser after a local unlock and is kept in tab memory only. Create vault deploys a presence-guarded Safe on Whitechain Sepolia through the relayer (no wallet or gas), with your identity address and the other signers' Tijori addresses as owners and a strict-majority threshold. The relayer verifies the deployment, owners, threshold, guard and verifier on-chain before the vault is stored; see the Whitechain section above. Vaults created earlier on Base Sepolia keep their previous behavior: MetaMask deployment, ETH balance, and transactions in the Safe app. The separate Acoustic proximity check section uses audio; its Send button never creates, signs or authorizes a transfer.

Deployment progress is kept in browser local storage. If deployment succeeded but saving to Arkiv failed, use Resume deployment. If the wallet submission outcome is unknown, enter the existing transaction hash from the wallet; the app will verify it rather than deploy again. Preserve browser data until registration succeeds. If the wallet transaction reverted, reconcile it before attempting a new deployment.

Existing demo vaults retain their old behavior and have no fund-holding address. Their transactions and balances remain simulations. Stored versions 1 and 2 retain their explicit address migration, versions 1–3 upgrade to version 4 when read (adding empty proximity history), version 4 to 5 (object profiles) and version 5 to 6 (empty Whitechain proposal and invoice collections), preserving existing records; a subsequent authorized write persists the upgraded representation. Legacy identifiers that are not EVM addresses remain preserved as legacy identifiers, without an invented address. Existing records have no generated key or passphrase, so they cannot log in through the new flow; their vault records and relationships are retained. There is no automatic identity reassignment or migration UI. Writes wait for a successful receipt and matching fresh Arkiv query before returning success. Group codes, object descriptions and encrypted private-key envelopes are omitted from the general API state. Login returns the requested identity’s encrypted envelope for browser-side unlocking; it is not access-controlled.


## Storage design and limits

`sdk/packages/core/src/vault.ts` preserves the demo rules and validates relationships. `sdk/packages/server/src/storage/arkiv.ts` stores a named `tichori_state_v1` entity with an indexed namespace, revision, encoding and unindexed ciphertext bytes. Reads require the configured creator and owner. One encrypted aggregate makes each logical change atomic and avoids partially updated membership or approvals. It deliberately targets a small demo: serialized plaintext is capped at 100,000 bytes and exact writes must also fit the gas limits. This is not a scalable relational database replacement.

AES-256-GCM uses an independent server key, a fresh 12-byte IV, and authenticated context binding chain genesis, signer, namespace and format version. Public metadata still reveals the server wallet, namespace, revision, ciphertext length, timing and expiration. Encryption does not add real user authentication. Keep the signing wallet exclusive to this app and do not transfer the state entity.

The entity, including encrypted identity keys, expires after **30 days** at creation. A passphrase alone cannot restore an expired or lost encrypted key. Object demo identities have a downloadable recovery file containing the encrypted key and its wrapping material; passphrase identities still have no backup/export UI. The app requires the original live Arkiv record to log in and never recreates missing state from that file. Patching does not renew expiration. Renewal, archival and restore are not automated; arrange authorized Lifetime Extension before expiration if you need longer retention. Missing, expired, transferred, duplicate, corrupted or reset state produces an error rather than an automatic empty vault. Keep encryption keys and a backup of the original SQLite source safe. Do not delete the Arkiv journal to reset the demo or its spending allowance.

`data/arkiv-<signer>-<namespace>.json` stores verified entity metadata, reserved fees and any pending signed transaction for recovery; it is not the application database. Writes fsync signed intent/hash before broadcast and preserve confirmed receipts before readback. A shared signer lock coordinates processes on one host. All processes must share `VAULT_DATA_DIR`; distributed/serverless writers and use of this wallet by other apps are unsupported.

No write is automatically resent. The next request reconciles a pending hash, verifies the mined transaction and ciphertext, and resumes without another signature. If a receipt is unavailable or reverted, writes stop for operator investigation. After a crash, confirm the process is stopped and inspect the journal before removing a stale `.lock` file. Preserve the journal and its signed bytes; never print or upload it. Idempotency keys retain the last 100 successful mutation IDs in encrypted state. Repeating a key with changed input fails. The UI reuses a pending operation ID when retrying the same input, including after a reload; it clears that ID on success. A pending signup also retains its encrypted envelope in session storage so a retry does not generate a different identity; resume the pending identity remembered in the browser, with its original name and object. Closing the browser tab before an uncertain signup is reconciled loses this retry record. A pending signup blocks a different signup payload until its original operation is reconciled.

The Arkiv MCP supplied network/schema/SDK guidance. Application reads and local signing use the SDK directly; credentials are never sent to the MCP.

## Checks

Run `npm run sdk:test` for the SDK, `npm run build` before `npm test` for the app, then `npm run lint`. The test suite uses a local RPC fixture and a throwaway signer, encryption key and journal directory. It exercises the real SDK encoding, signed transactions, API flow, receipt recovery and error guards without spending testnet funds. Fixture results do not establish live Rabdi persistence; `arkiv:check` and an authorized migration/write with readback establish that separately. `npm run arkiv:verify` performs a paid storage update of the same vault contents with a fresh encrypted envelope and verifies the receipt and exact readback.

## Acoustic checks on Arkiv

1. Sign up with a different synthetic identity on each device. Copy each generated public identity address from My vaults.
2. Choose **Create acoustic group**, enter a name and the other enrolled identity addresses. This stores a group in Arkiv without deploying a Safe. Members refresh My vaults and open the same group.
3. In **Acoustic proximity check**, tap **Send** on one device. Other members tap **Join check** and opt into their microphone. A fresh six-character challenge expires two minutes after session creation. The broadcaster repeats the selected audible or ultrasound signal until stopped or expired. Stop and close the check before changing the broadcast toggle. Keep devices close together. Ultrasound uses ggwave’s approximately 15–19.5 kHz band: it may still be audible to some people and can fail on hardware that filters high frequencies. If no match appears, close the check and retry in audible mode. No silent fallback to audible playback occurs.
4. A decoded match is encrypted and stored in Arkiv. Each member appears once. Closing the host dialog cancels the check; a best-effort cancellation also runs on navigation. Expiry still applies if that request cannot complete. Reloading preserves server sessions/matches; the original host tab can use **Resume signal** with its saved operation ID while the session remains active.

All session changes use the existing exclusive signer lock, fee budget and receipt/readback verification. Concurrent starts permit one winner; concurrent matches preserve every member. Repeated start operation IDs, duplicate matches and repeated cancellations do not add another write. Polling only reads, never spends gas, and never returns the challenge. Only a start/replayed start response returns its challenge to the declared host. This remains an unauthenticated local API: declaring someone else’s ID is possible, and encryption does not fix authentication. API failures leave the previous verified state intact or fail closed pending journal reconciliation; do not delete the journal or resend signed transactions.

Sessions and match history share the existing 100,000-byte aggregate limit and 30-day entity lifetime. History is retained, with no automatic pruning or renewal. Use this for a small prototype. Safe deployment, balances and signing remain separate; acoustic membership follows stored group members rather than current on-chain owners. Object checks use the separate browser DINOv2 flow and do not change acoustic matching or Safe authorization.

### Local phones

After configuring Arkiv as above, run `npm run dev:phone` and open https://localhost:3443. The QR panel lists private LAN links. Use the same Wi-Fi/hotspot, enroll distinct identities, and open the same group on both devices. Microphones need HTTPS; users handle the self-signed certificate warning themselves. `npm run dev:phone:watch` enables live development. LAN access is opt-in and exposes this unauthenticated demo and its paid-write API to that network; use a private trusted test network and synthetic data. Do not expose it publicly. Starting another server must use the same durable data directory for the shared signer.

### Verification

Run `npm run sdk:test` for the SDK, `npm run build` before `npm test` for the app, then `npm run lint`. Tests use throwaway local RPC fixtures and isolated journal directories, not live funds. They cover actual ggwave WASM waveform encoding/decoding, microphone cleanup, schema upgrades, read-only SQLite import, encrypted storage, membership/isolation, expiry/replay rejection, concurrent starts/matches, idempotency, restart persistence and uncertain-write reconciliation. Real speaker-to-microphone behavior still depends on device volume, permissions, hardware and room acoustics and requires a two-device check.

## Object sign-in (scanner v2, SDK 0.2.0)

An identity is a **username linked to a personal object**. You log in with the username and one photo of the same object, taken from any reasonable side. The **server** decides whether the photo matches, and a different object is refused.

**Flow**
1. **Sign up:**
   1. Enter a username.
   2. Open the camera, hold the object in the circle and tap **Scan object**.
   3. Turn the object slowly for about 2 seconds while three angles are captured automatically. There is no tapping or dragging: the object at the centre is isolated for you.
   4. Click **Register username & object**.
2. **Log in:** enter the username, take one photo of the object and click **Log in with my object**.
3. Every photo shows its cut-out (what was scanned). If it isn't just your object, click **Not your object? Brush over it**, paint over the object and click **Use my brushing**. For a sign-up scan, one brushing applies to all three angles.
4. Payout approvals in a Whitechain vault ask for one fresh photo too. It is checked on the server together with presence and your own signature.

**How matching works**
1. **On this device:**
   - SlimSAM isolates the object in the guide circle. Its candidates are nested (a part, the object, object + hand or face), so it keeps the largest candidate lying entirely inside the circle, which leaves out the person holding the object. With brushing, the painted area becomes positive points and a ring around it negative points, and the smallest candidate covering 70% of the painting wins. The cut-out is padded to a square on white and never stretched.
   - DINOv2-small then produces two vectors: the CLS token, and the mean of the patch tokens that cover the object. The background is excluded.
   - Photos and masks never leave the browser. Only these descriptors (about 1 KB per view) are sent.
2. **On the server (`@tijori/server`):**
   - At login, the server compares the photo's descriptor with the enrolled views: `score = w·cos(CLS) + (1 − w)·cos(object)`.
   - The identity matches when the best view reaches the threshold (`OBJECT_MATCH_CLS_WEIGHT` 0.5 and `OBJECT_MATCH_THRESHOLD` 0.80 in `@tijori/core/object-match`).
   - 0.80 is a conservative default. On real photos, different objects score 0.12–0.33 (a regression test in `sdk/tests/fixtures/real-objects.json`). Same-object angle tolerance has not been measured on real photos yet, so a very different angle may need a retake. Tune it with the object lab.
   - Only on a match does the server return the encrypted key envelope and the profile that derives its wrapping password.
   - Wrong-object attempts are throttled (5 per 10 minutes per identity).
   - `/api/v1/object-identities` lists usernames only.

**Limits (it is a demo, not authentication)**
- It tells different objects apart (a pen is not a bottle; two different bottles usually differ). Identical objects of the same model look the same.
- Anyone holding a stored profile (the server operator, or someone with server data or a backup file) can unlock the key without the object.
- The API is unauthenticated, and descriptors could be replayed by a client that has one.

Use synthetic names and test funds only.

**Calibration:**
1. Run `cd sdk && npm run dev -w examples/object-lab` and open http://127.0.0.1:3300.
2. Photograph several objects from different sides, including two of the same kind, and download the descriptor set (no photos).
3. Run `npm run calibrate -- <file>` in `sdk/` to get the CLS weight and threshold, with zero wrong-object accepts and the fewest same-object rejections.

**Upgrading from 0.1.x:**
- Object identities created with the old scanner (browser-only matching, a 0.50 threshold) are not accepted anymore. Their users see "Sign up again with a new scan", and their usernames can be registered again.
- Passphrase identities are unchanged.
- The vault moves from v6 to v7 (an additive migration), so 0.1.x servers cannot read state written by 0.2.0.

**Assets:** models load from the app's own origin after `tijori-client prepare-assets` (pinned, checksum-verified DINOv2, SlimSAM and ONNX Runtime WASM). Only the preparation step contacts Hugging Face. The camera is live-capture only; there is no gallery upload.

