# Arkiv application sign-off — 6 November 2026

**Historical baseline:** This report predates address-based identities and encrypted browser-generated keys. The old identifier login and invitation results below do not certify the current flow; see README for current behavior and limitations.

**Result: passed for the local prototype scope.** Tested the production build in the browser against live Arkiv Rabdi, chain 7794095, and reran the automated regression suite. Identity matching, proximity and group transfers remain simulations; this does not certify real authentication or multisig execution.

## Browser and live-storage verification

| Check | Result |
| --- | --- |
| Signup from the browser at `127.0.0.1` | Passed after origin-check fix |
| Five-member group creation and invitation claims | Passed; existing placeholder IDs and membership preserved |
| Simulated request creation | Passed; sender counted as first approval |
| Second approval | Remained pending with 2 of the required 3 approvals |
| Third approval | Completed with QA Alice, QA Bob and QA Cara |
| Another already-open session | Refreshed to the completed state through Receive / Check again and Activity navigation |
| Logout, incorrect object, uppercase demo ID login | Passed; incorrect object rejected and correct case-insensitive login accepted |
| Duplicate registration, completed-request approval, non-member sender, negative amount, cross-origin write | Rejected; verified no revision, transaction hash or fee reservation change |
| API versus decrypted Arkiv state | Exact match |
| Original SQLite records | All original IDs still present in Arkiv; SQLite source retained |
| Production-server restart and browser reload | Exact API state preserved; completed request still visible and session restored |
| Client JavaScript secret scan | Configured wallet key, RPC access key and encryption key absent from all 10 emitted JavaScript files |

Synthetic test records are retained as `QA Signoff 3-of-5` and `qa-signoff-*-1106`. Final totals: 11 identities (including unclaimed placeholders), 3 groups and 3 transaction requests. No real transfer was performed.

## Bugs fixed during this test

1. Same-origin submissions at `127.0.0.1` were incorrectly rejected because Next.js normalized the request URL hostname to `localhost`. Origin validation now compares the browser origin with the actual Host and protocol. The integration test includes a loopback browser-Origin regression and still rejects unrelated origins.
2. Receive / Check again only reused browser-cached state. Receive, Check again, group changes and view navigation now request uncached API state. Read generations prevent an older refresh from overwriting newer state or an in-progress submission. Transaction detail rendering was simplified to pass the React ref lint checks.

## Evidence

- Existing encrypted entity: `0x389f8a4fd5ba2b4b75a8ad9d8d981e1c5f66a7fb9670660e400c23424972519e`.
- Live state advanced from revision 2 to revision 9 through seven browser-triggered writes.
- [Final majority-approval storage transaction](https://rabdi.explorer.arkiv.network/tx/0x52531de5402de349a4c9ee228769c92be8dc6edf869169953e5f670c8026d441).
- Seven-write browser test spent **0.001456299 tGLM**, measured from the exclusive signer balance before and after testing. The journal's cumulative conservative reservation, including the earlier migration and verification, is **0.009 tGLM** against the approved **1 tGLM** cap.
- Local evidence: `data/qa-signoff/evidence.json` and `data/qa-signoff/completed.png`. These generated files remain ignored by Git.

Final checks passed: `npm run build`, `npm test`, `npm run lint`, and `git diff --check`. Automated fixtures additionally cover concurrent writes, repeated/conflicting idempotency keys, lost-send and missing-receipt recovery without resubmission, expired/missing/duplicate/reset state, upstream query failures, failed estimation, encryption corruption/wrong keys, and fee limits. Fixture results are separate from the live browser evidence above.

## Scope limits retained

The API remains a localhost-only demo with simulated identities and transfers. State has a 100,000-byte plaintext cap and expires 30 days after entity creation unless explicitly extended. Encryption keys and durable signer journals require private backup. Continuous real-time subscription is not implemented; refresh actions and navigation read current state.
