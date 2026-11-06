# Tichori API integration guide

This is an integration scaffold for the local prototype. Object matching and physical approvals remain simulations. External-vault verification is deliberately unconfigured and returns HTTP 501. The API has no real user authentication or application isolation: caller-supplied identity IDs are demo selectors, not credentials. Keep the server bound to localhost. Cross-origin POST requests remain blocked; trusted local server-to-server consumers can use the API without a browser Origin header. Do not expose it publicly or use real funds or sensitive data.

## Architecture and teammate handoff

```text
Tichori UI / another local app
    -> lib/api/client.ts (optional typed HTTP client)
    -> /api/v1/* (app/api/[...path]/route.ts)
    -> lib/api/service.ts (orchestration, durable writes, retry handling)
    -> lib/api/domain.ts (workflow checks and response presentation)
    -> lib/integrations/providers.ts (replaceable server-side implementations)
    -> lib/vault.ts / existing encrypted Arkiv store
```

All existing unversioned API routes remain available and use the same integrated service. There is no new storage schema or automatic migration. Existing locks, fee reservations, signed journals, fail-closed recovery and the last 100 successful mutation keys remain in use.

| Workstream | Contract to implement | Wiring location |
| --- | --- | --- |
| Object matching | `ObjectMatchingProvider.enroll` and `.verify` | `lib/integrations/providers.ts` |
| Physical discovery and approval | `PhysicalApprovalProvider.discover` and `.verify` | `lib/integrations/providers.ts` |
| Existing vault / DAO approval | `ExternalVaultProvider.verifyApproval` | `lib/integrations/providers.ts` |
| Camera/audio capture and wallet access | Client/device capture code; submit evidence references through the API client | Consuming application |

Provider interfaces are in `lib/integrations/contracts.ts`. Implement each provider in its own server module and import it into the registry. Selection is server controlled; requests cannot select a provider, enable live mode or submit `accepted: true` as a trusted result. Keep credentials in server-only modules. Return `{ accepted, mode, provider }`; report the actual mode honestly. Throw on unavailable verification rather than falling back to the demo implementation. Change `configured` only when the external adapter is ready.

Providers must independently verify reference ownership, authenticated actor, application scope, challenge freshness, replay protection and transaction binding. The current demo does not implement those mechanisms. A matching result is not an authentication session. Frequency matching is not proof of proximity. A physical approval result is not a wallet signature.

Provider calls must be read-only/idempotent verification operations. `enroll` currently validates a proposed enrollment before the aggregate write; it must not create an irreversible external enrollment before that write succeeds. Store additional enrollment references, challenges, consumed proofs or session state only through an explicitly designed schema migration and coordinated durable workflow. Do not add in-memory challenge state for a real integration. The existing description-only schema does not yet store feature vectors or image data.

The physical provider receives the stored legacy transaction details from the server, rather than trusting recipient/amount fields submitted by the caller. The external adapter receives an application ID, identity address, vault address, chain ID and exact transaction hash. These are untrusted claims until the adapter validates them. External verification does not write to Arkiv, count a quorum, sign, execute or import a vault. Real existing-vault registration, durable approval sessions and contract enforcement belong to that integration; they are not silently simulated.

## Endpoint contract

Base path: `/api/v1`. JSON requests and responses. Validation failures return `{ "error": "..." }` with HTTP 400, unavailable integrations return 501, and storage failures return 503. Responses are not cached. POST bodies are limited to 16,384 bytes. Do not send plaintext keys, passphrases or images. Use the separately reviewed capture system and pass only bounded opaque evidence references:

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

Use `lib/api/client.ts` directly inside this repository, or port its small HTTP client to the consuming app. This is a source-level client, not a published package. For a trusted local server, supply an absolute base URL; browser use currently requires the same origin.

```ts
import { createTichoriClient } from './lib/api/client';

const client = createTichoriClient('http://localhost:3000/api/v1');
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
