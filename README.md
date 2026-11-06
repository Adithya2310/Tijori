# Tichori

A local prototype for demo identities and shared treasuries. New vaults are presence-guarded Safe multisig treasuries on **Whitechain Sepolia, chain 1874**, holding USDT; vaults created earlier on Base Sepolia (84532) stay readable. Vault metadata and existing demo records persist in an encrypted Arkiv entity on **Rabdi, chain 7794095**, using `@arkiv-network/sdk` 1.0.1. SQLite is used only by the explicit, one-time migration command.

New identities use a real browser-side DINOv2 object-matching experiment adapted from VILA. The photo check is bypassable and provides no secure authentication or wallet recovery. Existing passphrase identities retain their original login path. Acoustic checks use real ggwave WASM, browser audio and opt-in microphone access, with sessions and matches persisted in the encrypted Arkiv aggregate. A match is a cooperative demo, not proof of physical proximity or identity; challenges can be replayed or relayed. Existing demo vaults and their requests remain simulated. New Safe vaults have real testnet contracts and signer-enforced thresholds; their transactions are handled in the Safe app, not by the demo approval flow. Anyone with access to this local app can switch demo identities. Use only testnet funds and synthetic identity information.

## Wi-Fi acoustic testing without Arkiv

For the current two-device test, set `TICHORI_STORAGE_MODE=local` in your ignored `.env.local`, then run `npm run dev:phone`. No Arkiv credentials or testnet funds are required in this mode. Open the printed HTTPS Wi-Fi URL on both devices (or `https://localhost:3443` on the laptop), on the same trusted network. Handle the local certificate warning yourself.

1. Create a different synthetic object-demo identity on each device on that device. Optional backups are under **Optional backup / move an existing identity**. Original photos and masks stay on that device. New compact feature references are saved to the selected encrypted server store; older full references remain local.
2. On one device choose **Create acoustic group**. Under **Registered people**, add the other enrolled user, enter a group name and create it. Users and groups refresh automatically every 2.5 seconds; both devices can open the same group.
3. In **Acoustic proximity check**, press **Send** on the laptop/device playing the sound. On the other device press **Join check**, allow microphone access, keep the page open and hold it near the speaker. Choose **Ultrasound broadcast** before Send for the high-frequency protocol, or leave it off for audible testing. The receiving device detects both automatically. Use device speakers, without headphones. A successful decode shows **Signal matched** on both devices’ member lists.

The laptop stores users, encrypted identity envelopes, groups, challenges and matches in `data/local-demo/state.json`, encrypted with the independent `data/local-demo/encryption.key`. Both are private Git-ignored local files. Concurrent requests/processes share an exclusive file lock; writes are atomic and synced. Restarting preserves identities/groups/matches, while two-minute challenges still expire normally. Polling never rewrites the database. Missing/corrupt initialized state or a missing key fails closed. Keep the key with the database privately; do not delete either while testing. A stopped process can leave `state.lock`; inspect it before any manual recovery.

The UI labels this **LOCAL WI-FI TEST**. The default remains Arkiv unless explicitly configured otherwise; there is no automatic fallback when Arkiv fails. Local mode makes no Arkiv calls, never uses its signer/journal/budget, and disables Safe registration. Both modes use the same v5 domain schema and acoustic protocol. Switching back to `TICHORI_STORAGE_MODE=arkiv` selects the existing separate Arkiv state; local records are not automatically migrated, merged or uploaded. SQLite remains a read-only migration source. This unauthenticated demo belongs only on a trusted test LAN. Real acoustic decoding is not proof of proximity or identity and never authorizes transactions.

## Whitechain treasury: co-present approvals for DAOs and large vaults

Tichori is a treasury for DAOs, teams and families. A payout from the vault needs a **majority of its signers, physically together in one place**, and **each approver verifies with their personal object**. On Whitechain this becomes an on-chain rule, not a UI convention:

- **The vault is a Safe 1.4.1 on Whitechain Sepolia** with a majority threshold. Its owners are the members' Tichori identity keys, which are generated and encrypted in the browser and unlocked by the person.
- **`TichoriPresenceGuard`** is installed when the Safe is created. Every execution must carry a fresh EIP-712 co-presence attestation from the vault's Tichori verifier for exactly that Safe transaction, and the threshold signers must be the attested owners. Executing from the Safe app, or any path without the attestation, reverts. A unanimous-owner escape hatch can only remove the guard or rotate the verifier.
- **Signers never touch crypto.** Approving is: show your object, have your phone hear the room code, tap Approve. That produces a free EIP-712 signature in the browser. There is no seed phrase, wallet popup, WBT or chain name. Tichori's relayer pays the gas, and **the vault refunds it in USDT** through Safe's native gas refund, capped by what the signers signed.
- **Vendors bill the treasury** through an invoice inbox: the `@tichori/invoices` SDK plus signed `invoice.paid` webhooks, a public receipt and an accountant CSV.

**Why this needs on-chain stablecoin settlement on Whitechain:**
- **What a bank or card rail can't do:** neither can enforce *who must be in the room* before money moves, refuse a payment without a co-presence proof, or let vendors and auditors verify that rule independently.
- **What Whitechain adds:** a guarded Safe holding USDT enforces the quorum and the presence attestation in the contract itself, then settles final in about 1 second for a fraction of a cent. Every payout, its approvers' attestation and its gas refund leave a public receipt nobody has to trust Tichori for.

### Architecture

```
Vendor app ──@tichori/invoices──► POST /api/v1/invoices ──► invoice inbox (encrypted Arkiv aggregate, vault v6)
Signer ──► POST /api/v1/proposals ──► POST /api/v1/approval-sessions (fixes SafeTx at live nonce, presence challenge)
Each signer in the room: object check + presence (room code) + own EIP-712 Safe signature ──► POST /api/v1/physical-approvals
Majority in ONE session ──► verifier signs CoPresence attestation ──► relayer ──► TichoriPresenceGuard.executeWithAttestation
                                                                                   └► Safe.execTransaction: USDT → vendor; USDT gas refund → relayer
Receipt: /invoice/[id] · webhook invoice.paid (HMAC) · GET /api/v1/treasury/export (CSV) · GET /api/v1/relayer (gas tank)
```

**Key files:**
- `contracts/`: the Foundry project, with `TichoriPresenceGuard`, `TichoriSafeSetup` and tests against the canonical Safe 1.4.1 bytecode read from Whitechain.
- `lib/whitechain/`: chain constants, EIP-712 helpers, the relayer (journaled, never resends) and the pure treasury domain.
- `lib/api/treasury.ts`: the service behind the `/api/v1` routes.
- `app/treasury-panel.tsx`: the UI.
- `packages/tichori-invoices`: the vendor SDK.
- `examples/vendor-studio`: a separate vendor app, where the integration is about 20 lines.

### Deployed on Whitechain Sepolia

| Item | Address / transaction |
| --- | --- |
| TichoriPresenceGuard | [`0x117919dCBBE5E2Aed227e89dddCa2f68B399B238`](https://explorer.testnet.whitechain.io/address/0x117919dCBBE5E2Aed227e89dddCa2f68B399B238) · [deploy tx](https://explorer.testnet.whitechain.io/tx/0x87389ab1f60015c0b1186d1665b5fe1d185e4a3ba17cb36bf829e42d0d93606f) |
| TichoriSafeSetup | [`0x6905DC2c7c3cA3b2eC97A209f493e949e5bA0e54`](https://explorer.testnet.whitechain.io/address/0x6905DC2c7c3cA3b2eC97A209f493e949e5bA0e54) · [deploy tx](https://explorer.testnet.whitechain.io/tx/0xb1f64904ba712097f66e659685961136b8f65b5629b0c0e1bdd6f7f3bd1552e0) |
| First co-present USDT payout | _explorer link added after the first live payout with the official USDT_ |
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
4. **Fill in `.env`.** Set `TICHORI_GUARD_ADDRESS` and `TICHORI_SAFE_SETUP_ADDRESS` from the script output. Set `WHITECHAIN_RELAYER_PRIVATE_KEY`, plus a separate `TICHORI_VERIFIER_PRIVATE_KEY` (`cast wallet new`, no funds). See `.env.example` for the optional limits.
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
2. Set `TICHORI_REHEARSAL_TOKEN_ADDRESS` in `.env`.

While it's set, the vault shows a **REHEARSAL TOKEN** flag and `capabilities()` reports `qualifying: false`. **Payments in it do not count for the Whitechain tracks.** Unset it, then make the README payout with the official USDT.

### Tests

- `forge test --root contracts`: 12 guard tests on the canonical Safe bytecode.
- `npm test`: unit tests plus the existing API flow.
- `npm run test:whitechain`: the production server against a local anvil chain (id 1874) with canonical Safe bytecode and mock USDT. It covers:
  - gasless vault creation and the vendor invoice
  - wrong object, presence or key, each rejected at zero cost
  - the guard blocking un-attested execution
  - the majority payout with a USDT gas refund
  - the signed webhook and the CSV export
  - separate sessions never combining

No testnet funds are spent by tests.

### Current limitations (honest)

- **Simulated checks:** object matching and the ultrasonic presence check are **simulated providers** in this repo.
  - The real implementations plug into `ObjectMatchingProvider` and `PresenceSessionProvider` (`lib/integrations`).
  - The UI emits `tichori:presence-emit` and calls `window.tichoriPresence.listen()` when present.
  - Frequency matching alone does not prove proximity: relay and replay must be handled by the real provider.
- **Simulated room code is visible to members:** in simulated presence mode, members' session listings include the room code so the flow can be demonstrated without audio. In live mode only the initiator's device receives it.
- **What a majority can still do:** the guard does not restrict *what* a co-present, attested majority approves. The server only builds USDT payouts, but the Safe would accept any attested transaction the owners sign, including adding modules. Safe 1.4.1 module transactions are not checked by transaction guards.
- **Trusted verifier:** the verifier is a trusted Tichori server key. The guard enforces that its attestation exists and matches, but cannot itself prove where anyone was.
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

Without a legacy database, the first valid signup creates the Arkiv entity. New signup uses the object-only experimental flow below. Existing passphrase identities can log in using **Use existing passphrase identity**: their AES-256-GCM envelopes remain protected by PBKDF2-SHA256 with 600,000 iterations and a random salt. Plaintext identity keys and user passphrases never go to the API or browser storage. The unauthenticated server does not enforce the browser check. On Whitechain vaults the identity key is the Safe signer: it signs approvals in the browser after a local unlock and is kept in tab memory only. Create vault deploys a presence-guarded Safe on Whitechain Sepolia through the relayer (no wallet or gas), with your identity address and the other signers' Tichori addresses as owners and a strict-majority threshold. The relayer verifies the deployment, owners, threshold, guard and verifier on-chain before the vault is stored; see the Whitechain section above. Vaults created earlier on Base Sepolia keep their previous behavior: MetaMask deployment, ETH balance, and transactions in the Safe app. The separate Acoustic proximity check section uses audio; its Send button never creates, signs or authorizes a transfer.

Deployment progress is kept in browser local storage. If deployment succeeded but saving to Arkiv failed, use Resume deployment. If the wallet submission outcome is unknown, enter the existing transaction hash from the wallet; the app will verify it rather than deploy again. Preserve browser data until registration succeeds. If the wallet transaction reverted, reconcile it before attempting a new deployment.

Existing demo vaults retain their old behavior and have no fund-holding address. Their transactions and balances remain simulations. Stored versions 1 and 2 retain their explicit address migration, versions 1–3 upgrade to version 4 when read (adding empty proximity history), version 4 to 5 (object profiles) and version 5 to 6 (empty Whitechain proposal and invoice collections), preserving existing records; a subsequent authorized write persists the upgraded representation. Legacy identifiers that are not EVM addresses remain preserved as legacy identifiers, without an invented address. Existing records have no generated key or passphrase, so they cannot log in through the new flow; their vault records and relationships are retained. There is no automatic identity reassignment or migration UI. Writes wait for a successful receipt and matching fresh Arkiv query before returning success. Group codes, object descriptions and encrypted private-key envelopes are omitted from the general API state. Login returns the requested identity’s encrypted envelope for browser-side unlocking; it is not access-controlled.


## Storage design and limits

`lib/vault.ts` preserves the demo rules and validates relationships. `lib/arkiv/store.ts` stores a named `tichori_state_v1` entity with an indexed namespace, revision, encoding and unindexed ciphertext bytes. Reads require the configured creator and owner. One encrypted aggregate makes each logical change atomic and avoids partially updated membership or approvals. It deliberately targets a small demo: serialized plaintext is capped at 100,000 bytes and exact writes must also fit the gas limits. This is not a scalable relational database replacement.

AES-256-GCM uses an independent server key, a fresh 12-byte IV, and authenticated context binding chain genesis, signer, namespace and format version. Public metadata still reveals the server wallet, namespace, revision, ciphertext length, timing and expiration. Encryption does not add real user authentication. Keep the signing wallet exclusive to this app and do not transfer the state entity.

The entity, including encrypted identity keys, expires after **30 days** at creation. A passphrase alone cannot restore an expired or lost encrypted key. Object demo identities have a downloadable recovery file containing the encrypted key and its wrapping material; passphrase identities still have no backup/export UI. The app requires the original live Arkiv record to log in and never recreates missing state from that file. Patching does not renew expiration. Renewal, archival and restore are not automated; arrange authorized Lifetime Extension before expiration if you need longer retention. Missing, expired, transferred, duplicate, corrupted or reset state produces an error rather than an automatic empty vault. Keep encryption keys and a backup of the original SQLite source safe. Do not delete the Arkiv journal to reset the demo or its spending allowance.

`data/arkiv-<signer>-<namespace>.json` stores verified entity metadata, reserved fees and any pending signed transaction for recovery; it is not the application database. Writes fsync signed intent/hash before broadcast and preserve confirmed receipts before readback. A shared signer lock coordinates processes on one host. All processes must share `VAULT_DATA_DIR`; distributed/serverless writers and use of this wallet by other apps are unsupported.

No write is automatically resent. The next request reconciles a pending hash, verifies the mined transaction and ciphertext, and resumes without another signature. If a receipt is unavailable or reverted, writes stop for operator investigation. After a crash, confirm the process is stopped and inspect the journal before removing a stale `.lock` file. Preserve the journal and its signed bytes; never print or upload it. Idempotency keys retain the last 100 successful mutation IDs in encrypted state. Repeating a key with changed input fails. The UI reuses a pending operation ID when retrying the same input, including after a reload; it clears that ID on success. A pending signup also retains its encrypted envelope in session storage so a retry does not generate a different identity; resume the pending identity remembered in the browser, with its original name and object. Closing the browser tab before an uncertain signup is reconciled loses this retry record. A pending signup blocks a different signup payload until its original operation is reconciled.

The Arkiv MCP supplied network/schema/SDK guidance. Application reads and local signing use the SDK directly; credentials are never sent to the MCP.

## Checks

Run `npm run build` before `npm test`, then `npm run lint`. The test suite uses a local RPC fixture and a throwaway signer, encryption key and journal directory. It exercises the real SDK encoding, signed transactions, API flow, receipt recovery and error guards without spending testnet funds. Fixture results do not establish live Rabdi persistence; `arkiv:check` and an authorized migration/write with readback establish that separately. `npm run arkiv:verify` performs a paid storage update of the same vault contents with a fresh encrypted envelope and verifies the receipt and exact readback.

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

Run `npm run build` before `npm test`, then `npm run lint`. Tests use throwaway local RPC fixtures and isolated journal directories, not live funds. They cover actual ggwave WASM waveform encoding/decoding, microphone cleanup, schema upgrades, read-only SQLite import, encrypted storage, membership/isolation, expiry/replay rejection, concurrent starts/matches, idempotency, restart persistence and uncertain-write reconciliation. Real speaker-to-microphone behavior still depends on device volume, permissions, hardware and room acoustics and requires a two-device check.

## Object-only DINOv2 experiment

This branch intentionally implements an **insecure object-only demo**, as requested. It is not a WebAuthn passkey implementation. A new private key is random, not derived from a photograph. Its existing v1 encrypted envelope is wrapped using a SHA-256 digest of the enrolled feature template as an internal wrapping password. The browser’s IndexedDB identity record (and optional recovery JSON) includes both that template and the encrypted envelope: **possession of the file is sufficient to decrypt the private key without any photo**. Encryption adds no protection against a file holder. Do not fund this identity or use sensitive objects/photos. There is no liveness detection, replay protection, calibrated false-accept rate or trusted authorization boundary.

1. Enter a synthetic name, opt into processing and choose/take an object photo and tap the foreground object. SlimSAM isolates it, then DINOv2 scans it automatically; the preview stays local. Click **Register object & create identity**. The app saves a pending browser record before signup and stores the new compact reference and encrypted key through the selected server adapter, so no recovery-file download is required. Storage errors block signup instead of creating a user without a remembered reference.
2. To log in again, select the identity retrieved from the server (or a remembered browser-only legacy identity) (automatically selected when there is one), then choose/take a photo of the same object. Scanning starts automatically. Click **Match object & log in**. A mismatch blocks the UI; the API must still return the matching original encrypted envelope. Missing server state is never recreated.
3. Under **Optional backup / move an existing identity**, export a backup or import an older recovery JSON once. Imported users are remembered for subsequent photo-only login. New browsers/devices retrieve new compact profiles from the selected server; older browser-only identities need the optional backup on a new origin; a photograph alone cannot recover its random private key. Existing passphrase identities retain their original login path.
4. Pending signup references and names persist locally before the request. Reload the same tab, show the same object, and retry using the same pending key/operation ID. Closing the tab still loses the session operation ID; reconcile uncertain writes rather than blindly resubmitting. Clearing site data removes the remembered reference. Backups are optional for the everyday flow but are needed if that reference is lost. Enrollment in one browser does not silently enroll other devices.

This follows VILA’s register-scene → authenticate-new-photo interaction, with browser persistence added for reloads. VILA’s own web demo holds its reference in memory; it does not implement durable wallet recovery. Photos are discarded on leaving the form; only versioned features, encrypted key envelopes, synthetic names and pending/registered status are persisted locally. No plaintext private key or user passphrase is stored. Anyone with the saved browser data or optional backup can bypass the image check. The server-side v5 schema adds only compact object profiles; public identity metadata, compact versioned references and encrypted key envelopes go to the selected encrypted server storage.

Model: `Xenova/dinov2-small`, pinned revision `c2bb04a51fab207c420665f1946016107bffc701`, fp32, RGB resized directly to 224 × 224 with ImageNet normalization; 384 CLS dimensions and 256 patch vectors. The score is adapted from [VILA](https://github.com/marcociama/VILA); see [third-party notices](THIRD_PARTY_NOTICES.md). GroundingDINO/SAM segmentation and attention visualization are not ported: manually frame the object against a simple background. Browser resizing/ONNX can differ from VILA’s Python preprocessing and scores; thresholds need real-world calibration. Recovery files are versioned and reject incompatible model revisions.

Only the preparation script on the laptop/build host contacts Hugging Face for the pinned public model; its downloads are resumable and verified before publication. The phone loads models/configuration and the matching installed WASM runtime from the app’s own origin. No photos or masks are transmitted. New compact reference templates are sent only to the selected server store, then encrypted inside its aggregate. Versioned public model/runtime files and browser model caches can be reused across retries. The download watchdog detects five minutes without progress rather than imposing a five-minute total deadline. Clearing site data removes model caches; the recovery file remains wherever you saved it. Recovery files and `.env*` secrets are Git-ignored. Keep them outside the source tree and never upload them to GitHub.

The inference worker can be served by a Vercel-hosted frontend; it requires no Python or inference server. **The full app is not ready to deploy publicly on Vercel.** Its unauthenticated paid-write API and Arkiv signer lock/journal require a separate authenticated backend with a persistent filesystem and exclusive signer ownership. This branch does not change that architecture or deploy the app.

Downloaded model/runtime artifacts live in Git-ignored `public/dino-assets/`. Keep these public files with the built app when hosting it. Preparation needs curl/network access on first run; subsequent builds reuse verified files. See `scripts/licenses/` and the license copies served beside the model/runtime. Do not place credentials or recovery files in `public/`.

## Isolated object profiles on Arkiv (v5)

New registrations now prompt you to tap the object in the photo. SlimSAM (`Xenova/slimsam-77-uniform`, pinned revision `5850ab45f587c112167512ffef949107115e26a0`, q8) generates a foreground mask on-device. The best predicted-IoU mask is applied, the background is made white and the bounding box is cropped before DINOv2 runs. Both signup and new-profile login use this pipeline. A failed/empty mask fails the scan; it never silently substitutes the original background. This is prompted segmentation, not VILA's text-based GroundingDINO detector or automatic object identification. Inspect framing and tap the same object each time. Keyboard activation chooses the image center. SlimSAM adds approximately 14 MB of model downloads, served from the laptop just like DINOv2. No photos or masks are uploaded.

The stored `sam-q8-grid32` profile contains CLS plus 32 spatially pooled, normalized patch descriptors, quantized to signed 8-bit values and base64 encoded (~17 KB). This reduces a multi-megabyte reference to fit the existing 100,000-byte prototype cap. Matching therefore differs from full VILA patch matching; the existing 0.50 threshold remains experimental and uncalibrated. It is not a security or false-accept guarantee. The app fails if its total state cap is reached; it never prunes histories or renews expiration automatically.

Aggregate **v4 → v5** is an explicit additive read migration: all existing identities, envelopes, Safe records, groups, transaction approvals, proximity history and operation IDs are preserved. New wallet records may carry a validated `objectProfile`. A subsequent authorized mutation persists v5 through the same signer lock, encrypted aggregate, durable journal, fee cap and receipt/readback verification. Reads do not spend gas. Legacy records do not receive invented templates or regenerated keys. Existing browser-only demo identities retain their previous path; they are not automatically uploaded, rekeyed or merged across local/Arkiv datasets.

With `TICHORI_STORAGE_MODE=arkiv`, `/api/object-identities` retrieves enrolled profile references and encrypted envelopes from Arkiv-backed storage, so another browser/device can log in without importing a recovery file or relying on IndexedDB. Normal `/api/state` responses omit templates/envelopes. Local mode uses the same v5 representation but remains a separate database. IndexedDB is a cache/pending-signup safety record, not the source of truth for new Arkiv profiles. Existing browser-only identities may still need an optional backup. The signup request limit is 32 KB; other API actions retain their previous limits.

**Object-only remains intentionally insecure.** A new EVM private key is random. Its wrapping password derives from the exact versioned compact profile bytes, not unstable floating-point image output, so retrieval reproduces the same wrapping key. However, the unauthenticated profile endpoint returns all material needed to unwrap it. Anyone with access to the local API, server data or a saved backup can bypass the photograph. This is not secure key custody or authentication. Passkeys were considered and explicitly declined for this demo. Do not use real funds. Safe signing remains in the connected wallet/Safe app. The server credentials and state encryption key are independent and must remain private.

For the shared-venue Wi-Fi setup, automatic approval review rejected exposing Arkiv mode’s unauthenticated paid-write API. Keep the phone server in local mode. Live Arkiv testing is available on loopback only, for example `TICHORI_STORAGE_MODE=arkiv npm run start -- --hostname 127.0.0.1 --port 3185`. Authenticated access and write authorization must be added before enabling Arkiv on shared LAN/public hosting. See `docs/identity-v5-verification.md`.

## Camera-only photo capture

Signup and object login now use **Open camera → Take photo → tap the object** through an in-app live camera preview. There is no gallery or image-file picker. Camera permission and HTTPS (or laptop localhost) are required. Video-only capture prefers the rear camera, bounds photos to 1280 pixels and keeps the photo in device memory. Tracks stop after capture, closing the camera, hiding the tab or leaving the form. Late permission responses are stopped after cancellation. Optional JSON recovery import is separate and does not accept images. This camera-only UI is not liveness detection: screens or printed photographs can still be presented.
