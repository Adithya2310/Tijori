# API scaffold verification — 6 November 2026

## Automated checks

- `npm run build`: passed (production compilation and TypeScript).
- `npm test`: passed (13 unit tests plus the production-server API/SDK integration fixture).
- `npm run lint`: passed.
- `git diff --check`: passed.

Coverage includes legacy/v1 compatibility, identity-scoped responses, server-calculated quorum and eligibility, replacement provider invocation, rejected provider results leaving state unchanged, evidence validation, successful mutation retries without duplicate writes, encrypted storage, journal recovery, missing/reset state, fee guards and unconfigured external-vault HTTP 501 responses.

## Manual verification

Ran the production app on an isolated loopback port, backed by the local RPC fixture, a throwaway signer, an independent test encryption key and a disposable journal directory. No existing application state was used. Seeded two synthetic participants and a legacy simulated vault/request for the approval test.

| Check | Observed result |
| --- | --- |
| Sign up through the browser | Identity created; public address shown; no unrelated vaults displayed |
| Log out and submit the wrong object description | Login rejected with the mismatch message |
| Submit the matching description and test passphrase | Login succeeded; participant's vault displayed |
| Open vault | Two members and two required approvals displayed |
| Listen for requests | Pending request discovered through the API |
| Review and approve | Activity changed from 1/2 pending to 2/2 Completed (simulated) |
| Listen again | Completed request no longer appeared in eligible results |
| Reload | Identity restored and completed approval persisted |
| Create another request through the browser | Request appeared with sender approval counted: 1/2 pending |
| Call `/api/v1/vaults/prepare` with two synthetic signer addresses | HTTP 200; Base Sepolia chain 84532; threshold 2; predicted Safe address; unsigned factory transaction with zero value |

The preparation check used read-only Base Sepolia RPC calls. No wallet transaction was submitted and no testnet funds were spent. Browser screenshot evidence was captured showing the completed request alongside the newly created pending request. The manual test server and disposable fixture state were cleaned up afterward.

## Limits

Real image matching, audio/proximity, authenticated multi-application use, existing-vault approval verification, contract-enforced physical approval, wallet deployment submission and on-chain transfer execution were not tested or implemented by this scaffold. The default object/physical providers remain explicitly simulated. External-vault verification remains unavailable until a teammate supplies its provider and supporting protocol.
