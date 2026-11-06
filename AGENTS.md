# Tichori contributor guide

## Product and current scope
Tichori is a local Next.js prototype for address-based demo identities and group transaction approvals. Identity checks, audio listening, proximity and legacy demo transfers remain simulations. New vaults deploy Safe multisig contracts on Base Sepolia through an explicitly connected user wallet; on-chain transfers and signatures are handled by the Safe app. Vault metadata is verified and stored through the encrypted Arkiv Rabdi adapter. Never describe a mock as a security guarantee. Do not use real funds or sensitive information.

## Get started
Use Node.js 22.20 or later, then `npm install`. Configure server-only Arkiv credentials, an independent state encryption key and explicit cumulative fee allowance using `.env.example`. Follow README.md, run `npm run arkiv:check`, and run `npm run arkiv:migrate` before first signup to import an existing SQLite demo. Start with `npm run dev -- --hostname 127.0.0.1` and open http://localhost:3000. SQLite is only a read-only migration source. Do not delete Arkiv journals to reset state or spending limits. The server needs a writable persistent filesystem; this setup is not suitable for stateless/serverless deployment.

## Structure and contracts
- `app/page.tsx`: client sign-up/login, dashboard, forms, simulated group listening and approval flow.
- `lib/identity-key.ts`: browser-side EVM identity generation, passphrase encryption and unlocking. Never send plaintext identity private keys or passphrases to the server.
- `app/globals.css`: shared visual system and responsive layouts.
- `app/api/[...path]/route.ts`: mock HTTP API and validation. `GET /api/state` returns `{ wallets, groups, transactions }`. POST actions are `signup`, `login`, `groups`, `transactions`, `approve`, and `register-safe`; `GET /api/balance` reads a registered Safe’s current Base Sepolia ETH balance and signers; successful writes return the same state. Validation errors return `{ error }` with status 400; storage failures return status 503. Mutation idempotency keys retain the last 100 successful operations.
- `lib/api/service.ts` and `lib/api/domain.ts`: shared orchestration, provider hooks and server-calculated workflow presentation. `/api/v1/*` is the versioned integration scaffold; legacy routes use the same service. `lib/api/client.ts` is the frontend HTTP client. See `docs/API.md` for payloads and teammate handoff.
- `lib/integrations/contracts.ts` and `lib/integrations/providers.ts`: replaceable server provider contracts and the current demo implementations. Real external-vault verification fails with 501 until configured. These hooks do not add authentication, application isolation or on-chain enforcement.
- `lib/db.ts`: server-only Arkiv entrypoint. `lib/arkiv/store.ts` handles SDK queries, encrypted aggregate writes, exclusive signer lock, fee reservation, signed transaction journal and recovery. `lib/vault.ts` validates domain state and relational integrity. `scripts/arkiv.ts` handles read-only checks and explicit SQLite migration.
- `data/`: generated local state, never commit it.

Each new signup generates an EVM key in the browser. The public address maps the identity; the private key is encrypted in the browser using AES-256-GCM and PBKDF2-SHA256 (600,000 iterations, random salt) with the user’s passphrase, then stored inside the separately encrypted Arkiv aggregate. Login returns the encrypted envelope and checks the passphrase locally. The unauthenticated local API and simulated object check do not prevent impersonation or unauthorized API actions. The encrypted envelope is available to local API callers and susceptible to offline passphrase guessing. Never store plaintext identity keys or passphrases in API requests, logs, browser storage, or server state. The Arkiv writer private key remains independently held in server-only configuration. There is no key export, backup, or signing integration; the generated identity is separate from the connected Safe wallet. Lost passphrases or expired/lost Arkiv entities make the identity key unrecoverable.

Legacy v1/v2 identifiers without a valid EVM address remain legacy records with their relationships intact; they do not gain fabricated addresses or encrypted keys. They cannot log in through the new signup/login flow and have no automatic reassignment. A group has a unique mock signal code and at least two members. Codes and object descriptions are omitted from state responses. New Safe addresses, signers and deployment transactions are public on Base Sepolia. Wallet/namespace/revision/size/timing metadata remains public. The state entity expires 30 days after creation; patches do not renew it. Renewal requires separately authorized Lifetime Extension. The sender's approval is recorded when creating a legacy simulated transaction; a strict majority completes it. Listening and object recognition remain simulations. Legacy balances are placeholders. Safe vault balances and signer configuration are read from Base Sepolia; Safe transactions are managed in the Safe app.

## Suggested independent workstreams
1. **Identity and object verification:** replace mock identity creation/sign-in with a reviewed object-verification and key-management design. VILA is a research reference (https://github.com/marcociama/VILA), not an integrated dependency. Its README describes DINOv2 features and encrypted vault/key derivation; object recognition alone is not a private key or proof of secure recovery. Define enrollment, authentication, recovery, threat model and consent before connecting it.
2. **Proximity and multisig:** replace the simulated dial with an actual audio protocol and integrate real transaction creation, signing and execution. Frequency matching alone does not prove proximity; consider replay, relay, spoofing, consent and quorum enforcement. Enforce authorization and quorum in a trusted contract, not only in the UI or this mock API.
3. **Platform integrations:** consider Anon RPC behind an explicit adapter; evolve the Arkiv aggregate only with an explicit schema migration. Define identity mapping, schemas, data retention and network behavior before migrating the local storage or claiming privacy properties.

Coordinate API/schema changes across workstreams. Store only browser-encrypted demo identity key envelopes in the aggregate; never store plaintext private keys, passphrases, object images, or real personal data. Do not use real funds. Use migrations for future schema changes rather than relying on `CREATE TABLE IF NOT EXISTS`. Keep changes focused and commit them separately. Run `npm run build` and the relevant checks before handing off.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Run `npm run build` before `npm test`; the integration test uses a local RPC fixture, throwaway signer and isolated durable journal directory with a production server. Tests do not spend testnet funds. Keep writes serialized across all local processes using the signer and shared persistent data directory. Do not expose this unauthenticated paid-write API publicly. Missing/expired/reset state and uncertain transactions must fail closed; never automatically recreate or resend them. Back up encryption keys privately. The 100,000-byte aggregate is intended only for the small prototype.
