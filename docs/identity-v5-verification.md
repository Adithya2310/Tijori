# Object isolation and Arkiv verification — 2026-11-06

Verified on branch `dino/passkey` with synthetic identity data and the public Transformers.js cats fixture. No personal photos or plaintext keys were sent to the server.

- Browser: select photo → select foreground point → real quantized SlimSAM mask/crop → real fp32 DINOv2 → compact profile → random EVM identity.
- Storage: live Rabdi entity upgraded additively from v4 to v5 through the existing encrypted adapter, signer lock and signed journal. Users increased from 15 to 16; all 4 groups and 3 transactions remained. Readback contained exactly one new object profile.
- Confirmed revision: 13. Entity: `0x389f8a4fd5ba2b4b75a8ad9d8d981e1c5f66a7fb9670660e400c23424972519e`.
- Receipt: [Rabdi transaction](https://rabdi.explorer.arkiv.network/tx/0xa55113b7d451dad894fda9b323e9dfb3ae0c87cde69db669bfb5350c8b580e89). Reported transaction fee: 0.001319224 test GLM; maximum reserved by the journal: 0.002661722 test GLM, within the configured cumulative cap.
- Retrieval: a different browser origin (`localhost` rather than `127.0.0.1`) with no local enrollment record retrieved the identity/reference from Arkiv, processed the photo again and logged in without a recovery file.
- Regression tests cover additive migration, encrypted state, compact-profile key roundtrip, oversized state rejection, malformed profiles, concurrent local signups, profile retrieval, acoustic sessions and uncertain-write reconciliation using isolated fixtures.

Limits: this smoke test demonstrates data processing and persistence, not reliable recognition under real-world lighting/viewpoint changes or secure authentication. Compact pooled references use an uncalibrated threshold. Object-only protection was explicitly selected; the profile endpoint supplies the key-wrapping material and is unauthenticated. Do not use real funds. A physical phone/SAM performance test remains device-dependent. Existing local demo records were preserved separately, not silently merged into Arkiv.

## Shared-network limitation

Live Arkiv writes and fresh-origin login were verified on loopback only. Automatic approval review rejected running the unauthenticated paid-write API on the shared venue Wi-Fi. The Wi-Fi launcher therefore remains in local mode; use a loopback Arkiv server for live persistence verification. Do not expose the Arkiv mode to the LAN until authenticated access and per-user write authorization are implemented and reviewed.
