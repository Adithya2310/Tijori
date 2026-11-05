# Privacy Vault contributor guide

## Product and current scope
Privacy Vault is a local Next.js prototype for object-based identities and group transaction approvals. The current application is deliberately a simulation: no wallet, private key, blockchain transaction, World ID, DINOv2, Arkiv, Anon RPC, audio transmission, microphone access, or proximity verification exists. Never describe a mock as a security guarantee. Do not use real funds or sensitive information.

## Get started
Use Node.js 22.20 or later (the app uses `node:sqlite`), then `npm install` and `npm run dev`. Open http://localhost:3000. SQLite is created automatically at `data/vault.sqlite`; it is local, ignored by Git, and can be deleted to reset the demo. The SQLite API is experimental in Node 22. The server needs a writable persistent filesystem; this setup is not suitable for stateless/serverless deployment.

## Structure and contracts
- `app/page.tsx`: client dashboard, identity switching, forms, simulated receive dial and approval flow.
- `app/globals.css`: shared visual system and responsive layouts.
- `app/api/[...path]/route.ts`: mock HTTP API and validation. `GET /api/state` returns `{ wallets, groups, transactions }`. POST actions are `wallets`, `groups`, `transactions`, and `approve`; successful writes return the same state. Errors return `{ error }` with status 400.
- `lib/db.ts`: SQLite schema and connection. Keep relational integrity and persist changes through the API.
- `data/`: generated local state, never commit it.

A group has a generated frequency and at least two existing identities. The sender's approval is recorded when creating a transaction. A strict majority (`floor(memberCount / 2) + 1`) completes a simulated transaction. Each member can approve once. The receive dial only simulates matching: the server does not authenticate a listener or enforce physical proximity. Switching identities is a local demo control, not authentication. IDs and recipient strings are placeholders, not World IDs or wallet addresses.

## Suggested independent workstreams
1. **Identity and object verification:** replace mock identity creation/sign-in with a reviewed object-verification and key-management design. VILA is a research reference (https://github.com/marcociama/VILA), not an integrated dependency. Its README describes DINOv2 features and encrypted vault/key derivation; object recognition alone is not a private key or proof of secure recovery. Define enrollment, authentication, recovery, threat model and consent before connecting it.
2. **Proximity and multisig:** replace the simulated dial with an actual audio protocol and integrate real transaction creation, signing and execution. Frequency matching alone does not prove proximity; consider replay, relay, spoofing, consent and quorum enforcement. Enforce authorization and quorum in a trusted contract, not only in the UI or this mock API.
3. **Platform integrations:** add World ID, Arkiv and Anon RPC behind explicit adapters. Define identity mapping, schemas, data retention and network behavior before migrating the local storage or claiming privacy properties.

Coordinate API/schema changes across workstreams. Avoid storing private keys, object images, secrets or real personal data in this demo database. Use migrations for future schema changes rather than relying on `CREATE TABLE IF NOT EXISTS`. Keep changes focused and commit them separately. Run `npm run build` and the relevant checks before handing off.
