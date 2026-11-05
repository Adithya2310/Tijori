# Tichori contributor guide

## Product and current scope
Tichori is a local Next.js prototype for object-based identities and group transaction approvals. Identity checks and group transfers remain simulations: no real World ID, DINOv2, Anon RPC, audio transmission, microphone access, proximity verification or multisig execution exists. Storage uses real Arkiv Rabdi transactions through a server-only wallet and encrypted SDK adapter. Never describe a mock as a security guarantee. Do not use real funds or sensitive information.

## Get started
Use Node.js 22.20 or later, then `npm install`. Configure server-only Arkiv credentials, an independent state encryption key and explicit cumulative fee allowance using `.env.example`. Follow README.md, run `npm run arkiv:check`, and run `npm run arkiv:migrate` before first signup to import an existing SQLite demo. Start with `npm run dev -- --hostname 127.0.0.1` and open http://localhost:3000. SQLite is only a read-only migration source. Do not delete Arkiv journals to reset state or spending limits. The server needs a writable persistent filesystem; this setup is not suitable for stateless/serverless deployment.

## Structure and contracts
- `app/page.tsx`: client sign-up/login, dashboard, forms, simulated group listening and approval flow.
- `app/globals.css`: shared visual system and responsive layouts.
- `app/api/[...path]/route.ts`: mock HTTP API and validation. `GET /api/state` returns `{ wallets, groups, transactions }`. POST actions are `signup`, `login`, `groups`, `transactions`, and `approve`; successful writes return the same state. Validation errors return `{ error }` with status 400; storage failures return status 503. Mutation idempotency keys retain the last 100 successful operations.
- `lib/db.ts`: server-only Arkiv entrypoint. `lib/arkiv/store.ts` handles SDK queries, encrypted aggregate writes, exclusive signer lock, fee reservation, signed transaction journal and recovery. `lib/vault.ts` validates domain state and relational integrity. `scripts/arkiv.ts` handles read-only checks and explicit SQLite migration.
- `data/`: generated local state, never commit it.

A group has a unique generated mock signal code and at least two members. Entering a World ID creates a placeholder member if needed; a later sign-up claims it. Codes and object descriptions are encrypted in Arkiv state and omitted from state responses. Wallet/namespace/revision/size/timing metadata remains public. The state entity expires 30 days after creation; patches do not renew it. Renewal requires separately authorized Lifetime Extension. The sender's approval is recorded when creating a transaction. A strict majority (`floor(memberCount / 2) + 1`) completes a simulated transaction. Each member can approve once. Receiving only simulates matching: the server does not authenticate a listener or enforce physical proximity. Sign-up and login match a stored object description and World ID string; they are not real authentication, object recognition, or World ID verification. Log out and log in as another demo member to test approvals. IDs and recipient strings are placeholders, not verified World IDs or wallet addresses. Balances are zero placeholders and are not updated by transactions.

## Suggested independent workstreams
1. **Identity and object verification:** replace mock identity creation/sign-in with a reviewed object-verification and key-management design. VILA is a research reference (https://github.com/marcociama/VILA), not an integrated dependency. Its README describes DINOv2 features and encrypted vault/key derivation; object recognition alone is not a private key or proof of secure recovery. Define enrollment, authentication, recovery, threat model and consent before connecting it.
2. **Proximity and multisig:** replace the simulated dial with an actual audio protocol and integrate real transaction creation, signing and execution. Frequency matching alone does not prove proximity; consider replay, relay, spoofing, consent and quorum enforcement. Enforce authorization and quorum in a trusted contract, not only in the UI or this mock API.
3. **Platform integrations:** add World ID and Anon RPC behind explicit adapters; evolve the Arkiv aggregate only with an explicit schema migration. Define identity mapping, schemas, data retention and network behavior before migrating the local storage or claiming privacy properties.

Coordinate API/schema changes across workstreams. Avoid storing private keys, object images, secrets or real personal data in this demo database. Use migrations for future schema changes rather than relying on `CREATE TABLE IF NOT EXISTS`. Keep changes focused and commit them separately. Run `npm run build` and the relevant checks before handing off.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Run `npm run build` before `npm test`; the integration test uses a local RPC fixture, throwaway signer and isolated durable journal directory with a production server. Tests do not spend testnet funds. Keep writes serialized across all local processes using the signer and shared persistent data directory. Do not expose this unauthenticated paid-write API publicly. Missing/expired/reset state and uncertain transactions must fail closed; never automatically recreate or resend them. Back up encryption keys privately. The 100,000-byte aggregate is intended only for the small prototype.
