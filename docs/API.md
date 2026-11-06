# Tijori API integration guide

This is an integration scaffold for the local prototype. Object matching and physical approvals remain simulations. External-vault verification is deliberately unconfigured and returns HTTP 501. The API has no real user authentication or application isolation: caller-supplied identity IDs are demo selectors, not credentials. Keep the server bound to localhost. Cross-origin POST requests remain blocked; trusted local server-to-server consumers can use the API without a browser Origin header. Do not expose it publicly or use real funds or sensitive data.

## Architecture and teammate handoff

```text
Tijori UI / another local app
    -> @tijori/client createTijoriClient() (sdk/packages/client/src/api.ts, optional typed HTTP client)
    -> /api/v1/* (app/api/[...path]/route.ts)
    -> sdk/packages/server/src/handler.ts (routing, limits, origin check) via createTijoriServer()
    -> sdk/packages/server/src/services/service.ts (orchestration, durable writes, retry handling)
    -> sdk/packages/core/src/api/domain.ts (workflow checks and response presentation)
    -> sdk/packages/server/src/providers.ts (replaceable server-side implementations)
    -> sdk/packages/core/src/vault.ts / the configured storage adapter (encrypted Arkiv store by default)
```

All existing unversioned API routes remain available and use the same integrated service. This branch uses the additive v5 object-profile schema migration described in README.md; all versioned and legacy mutations use the same selected storage adapter. Existing locks, fee reservations, signed journals, fail-closed recovery and the last 100 successful mutation keys remain in use.

| Workstream | Contract to implement | Wiring location |
| --- | --- | --- |
| Object matching | `ObjectMatchingProvider.enroll` and `.verify` | `sdk/packages/server/src/providers.ts` |
| Physical discovery and approval | `PhysicalApprovalProvider.discover` and `.verify` | `sdk/packages/server/src/providers.ts` |
| Existing vault / DAO approval | `ExternalVaultProvider.verifyApproval` | `sdk/packages/server/src/providers.ts` |
| Camera/audio capture and wallet access | Client/device capture code; submit evidence references through the API client | Consuming application |

Provider interfaces are in `sdk/packages/core/src/integrations.ts`. Implement each provider in its own server module and pass it as `createTijoriServer({ providers: { objectMatching, … } })`. Selection is server controlled; requests cannot select a provider, enable live mode or submit `accepted: true` as a trusted result. Keep credentials in server-only modules. Return `{ accepted, mode, provider }`; report the actual mode honestly. Throw on unavailable verification rather than falling back to the demo implementation. Change `configured` only when the external adapter is ready.

Providers must independently verify reference ownership, authenticated actor, application scope, challenge freshness, replay protection and transaction binding. The current demo does not implement those mechanisms. A matching result is not an authentication session. Frequency matching is not proof of proximity. A physical approval result is not a wallet signature.

Provider calls must be read-only/idempotent verification operations. `enroll` currently validates a proposed enrollment before the aggregate write; it must not create an irreversible external enrollment before that write succeeds. Store additional enrollment references, challenges, consumed proofs or session state only through an explicitly designed schema migration and coordinated durable workflow. Do not add in-memory challenge state for a real integration. The existing description-only schema does not yet store feature vectors or image data.

The physical provider receives the stored legacy transaction details from the server, rather than trusting recipient/amount fields submitted by the caller. The external adapter receives an application ID, identity address, vault address, chain ID and exact transaction hash. These are untrusted claims until the adapter validates them. External verification does not write to Arkiv, count a quorum, sign, execute or import a vault. Real existing-vault registration, durable approval sessions and contract enforcement belong to that integration; they are not silently simulated.

## Endpoint contract

Base path: `/api/v1`. JSON requests and responses. Validation failures return `{ "error": "..." }` with HTTP 400, unavailable integrations return 501, and storage failures return 503. Responses are not cached. Signup bodies (legacy `/signup` and v1 `/identities`) are limited to 32,768 bytes for compact object profiles; other POST bodies are limited to 16,384 bytes. Do not send plaintext keys, passphrases or images. Use the separately reviewed capture system and pass only bounded opaque evidence references:

```json
{ "reference": "capture-reference", "challengeId": "challenge-reference" }
```

Both fields are required when `evidence` is supplied, each at most 256 characters; other evidence fields are rejected. These strings alone prove nothing. Providers must validate them. The demo providers ignore their meaning.

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| GET | `/capabilities` | None | Provider modes, external adapter availability and local-demo limitations; no storage read |
| GET | `/state?identityId=...` | Demo identity selector | `{ wallets, groups, transactions }` scoped to that identity's groups; without a selector all arrays are empty |
| GET | `/balance?vaultId=...` | Registered local Safe group ID | Current Base Sepolia balance, owners and threshold |
| POST | `/identities` | `name`, `address`, `objectName`, `keyEnvelope`, optional `evidence` | Object enrollment hook, then signup; scoped state and `identityId` |
| POST | `/identities/login` | `address`, `objectName`, optional `evidence` | Object verification hook; scoped state, `identityId`, encrypted `keyEnvelope` for local unlocking |
| POST | `/objects/verify` | `address`, `objectName`, optional `evidence` | `{ identityId, verification }`; no state write or key envelope; requires an existing encrypted identity enrollment |
| POST | `/groups` | `name`, `creatorId`, `addresses` | Create a legacy simulated group; scoped state |
| POST | `/transactions` | `groupId`, `senderId`, `recipient`, `amount`, `asset`, optional `note` | Create a legacy simulated request; scoped state |
| POST | `/physical-approvals/discover` | `identityId`, `groupId`, optional `evidence` | `{ requests, verification }`; member check, discovery hook, eligible pending legacy requests; no state write |
| POST | `/physical-approvals` | `walletId`, `transactionId`, optional `evidence` | Member/pending/duplicate checks, physical verification hook, then legacy simulated approval; scoped state |
| POST | `/vaults/prepare` | `name`, `creatorId`, `owners` (connected wallet first) | Validated owners, majority threshold, predicted address, salt, chain and unsigned deployment `transaction: { to, data, value }`; no wallet submission or storage write |
| POST | `/vaults/register-safe` | `name`, `creatorId`, `owners`, `saltNonce`, `address`, `deploymentTxHash` | Existing on-chain deployment verification and registration; scoped state |
| POST | `/vaults/verify-approval` | `applicationId`, `identityAddress`, `vaultAddress`, `chainId`, `transactionHash`, `evidence` | HTTP 501 by default; configured adapter returns `{ verification, transactionHash, vaultAddress, chainId, executed: false }` after acceptance |

Groups in versioned state include `requiredApprovals`. Transactions include `requiredApprovals` and `canApprove` for the selected identity. The frontend displays these decisions. Local form checks remain usability checks; the server enforces mutations. State scoping is a response convenience and does not provide access control in this unauthenticated prototype. Stored Safe configuration in state is deployment metadata; `/balance` returns live signer configuration.

Mutation endpoints (`identities`, `groups`, `transactions`, `physical-approvals`, `vaults/register-safe`) accept `Idempotency-Key` with 1–100 word/hyphen characters. Reuse the same key and exact JSON input for retries, including across the legacy and v1 aliases. A changed payload with the same key is rejected. Successful retries skip verification hooks and the paid write. Replay state is limited to the last 100 mutations. Login, discovery, object verification, preparation and external verification are not persisted mutation receipts and must not consume one-time evidence without a durable protocol of their own.

The legacy routes retain their full-state response shape. The versioned routes scope mutation responses to `identityId` for signup/login, `creatorId` for groups/registration, `senderId` for transaction creation and `walletId` for approval. Neither response includes object descriptions or signal codes. Only login returns an encrypted key envelope.

## Consuming from another application

Use `createTijoriClient` from `@tijori/client` (source: `sdk/packages/client/src/api.ts`). Its request and response types come from `@tijori/core/api/types`, which the server handlers are also annotated with. For a trusted local server, supply an absolute base URL; browser writes currently require the same origin.

```ts
import { createTijoriClient } from '@tijori/client';

const client = createTijoriClient({ baseUrl: 'http://localhost:3000/api/v1' });
const state = await client.state(identityId);
const { requests, verification } = await client.discover(identityId, groupId);
// Show verification.mode; the default result is explicitly simulated.
await client.mutate('approve', {
  walletId: identityId,
  transactionId: requests[0].id,
  evidence: { reference: captureReference, challengeId },
}, stableOperationId);
```

Raw external-vault verification request (returns 501 until your teammate connects the adapter):

```http
POST /api/v1/vaults/verify-approval
Content-Type: application/json

{
  "applicationId": "local-dao-demo",
  "identityAddress": "0x1111111111111111111111111111111111111111",
  "vaultAddress": "0x2222222222222222222222222222222222222222",
  "chainId": 84532,
  "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "evidence": { "reference": "capture-reference", "challengeId": "challenge-reference" }
}
```

For Safe creation, request `/vaults/prepare`, review and submit the unsigned transaction through the connected user's wallet, preserve the pending deployment, and register the confirmed deployment through `/vaults/register-safe`. Preserve uncertain submissions and resume the existing transaction; never automatically deploy again. Browser encryption/unlocking and wallet approval remain device-side. Real Safe transfers and signatures continue in the Safe app.

## Before making a real integration available to other applications

Add actual user authentication, application isolation and permissions, authenticated enrollment access, a reviewed enrollment/recovery protocol, durable proof/challenge/session handling, usage controls and an explicit allowed-origin policy. Keep private keys/passphrases local. If a physical approval must be mandatory, enforce it in the supported vault contracts and cover every execution path. The present API scaffold does not provide these guarantees.

Run `npm run build`, then `npm test`, then `npm run lint`. Tests use local fixtures and do not spend testnet funds.

## Browser object-profile integration

DINOv2/SlimSAM processing remains on-device and separate from the server-side simulated object provider. Signup may include a validated `objectProfile`; the server provider hook still runs before mutation. `/api/object-identities` and `/api/v1/object-identities` expose compact profiles and encrypted envelopes for the explicitly insecure object-only flow. State responses include `storageMode` and an enrolled public `peers` directory; v1 wallets/groups/transactions retain identity scoping. Profiles never appear in normal state. Both API aliases use `withState`, honoring explicit local mode and Arkiv by default; local mode rejects Safe preparation/registration. The profile endpoint is unauthenticated and supplies wrapping material, so this is not secure authentication or key custody. Do not expose Arkiv mode publicly.

## Whitechain treasury endpoints

Guarded Safe vaults on Whitechain Sepolia (chain 1874). These endpoints share the router, body limits, origin rule and error mapping above. A missing relayer or contract configuration returns 501, and an invalid inbox key returns 401. Treasury payouts never use the legacy `transactions`/`approve` flow.

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| POST | `/vaults/whitechain` | `name`, `creatorId`, `addresses` (other signers' Tijori addresses); `Idempotency-Key` | The relayer deploys a majority Safe with `TichoriPresenceGuard` and the verifier installed at setup, verifies it on-chain, registers it. Returns scoped state and `vaultId`. A retry with the same key resumes and does not deploy again. |
| POST | `/proposals` | `vaultId`, `proposerId`, plus `to` + `amount` (USDT decimal) + optional `note`, or `invoiceId`; `Idempotency-Key` | Pending payout (one Arkiv write). Invoice payouts take the vendor address and amount from the invoice. |
| POST | `/approval-sessions` | `proposalId`, `initiatorId` (a current Safe owner) | Fixes the SafeTx at the live nonce (USDT transfer, vault-paid USDT gas refund capped by the signed fields), supersedes other open sessions for the vault and creates a presence challenge. Returns `{ session, emit }`; only the initiator receives `emit.code` to broadcast. |
| GET | `/treasury/sessions?identityId=` | Demo identity | Open and recent sessions for that member's vaults: SafeTx fields to sign, quorum progress, presence `challengeId`. In simulated mode it also returns `simulatedCode`. |
| POST | `/physical-approvals` with `sessionId` | `sessionId`, `walletId`, `objectName`, `evidence: { reference: heardCode, challengeId }`, `signature` (EIP-712 SafeTx signature by the approver's identity key) | Checks, for this approval: object (`ObjectMatchingProvider`), presence in this session (`PresenceSessionProvider`), signer = this identity and a current owner. At the threshold, the verifier signs the `CoPresence` attestation and the relayer calls `executeWithAttestation`. Returns the session (`executed` with `txHash`) and scoped state. |
| POST | `/vaults/inbox-key` | `vaultId`, `identityId` (member), `issuedAt` (ISO time, at most 5 min old), `signature` (EIP-191 over `inboxKeyMessage(vaultId, identityId, issuedAt)` from `@tijori/core/whitechain/safe-tx`, by the member's identity key) | `{ inboxKey, webhookSecret, endpoint }`. Derived from the server master key, so nothing secret is stored. Rotating `TIJORI_API_MASTER_KEY` revokes every issued key. |
| POST | `/invoices` | `Authorization: Bearer tinbox_…`; `vendorName`, `vendorAddress`, `amount`, `memo`, `dueDate` (YYYY-MM-DD), optional `externalId` (idempotent) and `webhookUrl` | `{ invoice, created, receiptPath }`. |
| GET | `/invoices?id=` | Bearer inbox key | Invoice with `payment { txHash, explorerUrl, paidAt, approvals }` once paid. |
| POST | `/invoices/remind` | Bearer inbox key; `id` | Increments reminders, at most hourly. |
| GET | `/treasury/export?vaultId=&identityId=` | Member | `text/csv` accountant export, with formula-safe cells. |
| GET | `/relayer` | None | Gas tank: relayer WBT, payouts sponsored, USDT refunds received, limits, pending transaction. |

**Webhooks:** `invoice.paid` is POSTed to the invoice's `webhookUrl` with header `Tijori-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`. It is retried twice. Verify it with `verifyWebhook()` from `@tijori/invoices`.

By default, non-public destinations are refused. That covers loopback, private, link-local, CGNAT, ULA, IPv4-mapped and reserved addresses. They are refused at invoice creation for IP literals and local names, and again after DNS resolution at every delivery. A residual DNS-rebinding window remains between that check and the connection. `TIJORI_WEBHOOK_ALLOW_PRIVATE=1` allows local destinations for the local vendor example.

**Presence provider:** implement `PresenceSessionProvider` (`createChallenge`, `verify`) and pass it as `createTijoriServer({ providers: { presence } })`.
- In the browser, the initiator's page calls `<TijoriProvider onPresenceEmit>` and dispatches `tijori:presence-emit` (and the deprecated `tichori:presence-emit`) with `{ challengeId, code, expiresAt }` for the emitter.
- Approvers' pages call the `presence` listener passed to `<TijoriProvider>` (or `window.tijoriPresence`, falling back to the deprecated `window.tichoriPresence`); `listen(challengeId)` resolves with the heard code.
- The provider must reject relayed, replayed and stale evidence.

**On-chain enforcement:** `TichoriPresenceGuard` blocks every Safe execution except attested ones, and the threshold signers must be the attested approvers. The unanimous-owner escape hatch can only remove the guard or rotate the verifier.
