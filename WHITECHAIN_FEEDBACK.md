# Whitechain feedback

Notes from building Tichori, a co-present treasury with guarded Safes paying USDT, at ETHGlobal Mumbai 2026.

## What worked well

- **Canonical contracts are preinstalled.** Safe 1.4.1 (factory, SafeL2, fallback handler), the ERC-4337 EntryPoints, Permit2, Multicall3 and CreateX sit at their usual addresses on chain 1874. Our Safe guard worked unchanged against the exact deployed bytecode. We copied that bytecode into Foundry tests so they run offline.
- **Tooling works out of the box.** viem already ships `whitechainSepolia`. `@safe-global/safe-deployments` lists 1874. 1-second blocks make relayed payouts feel instant.
- **Blockscout API v2 is genuinely useful.** It answered "which implementation is behind this USDT proxy" and "what gas do similar payment transactions use" in minutes.
- **The hackathon USDT is full-featured.** It is TetherTokenV2 with EIP-2612 `permit` and EIP-3009 (`transferWithAuthorization` / `receiveWithAuthorization`, including the `bytes` signature variants that accept EIP-1271). That opens up a lot of gasless designs.
- **The `whitechain-dev` agent skill installed cleanly** and its deploy and verify recipes match the docs.

## Where we got stuck

- **Two different USDT tokens.** The track page requires USDT `0xcedfB561…f55a7`, but the docs' token list and Portal pages show a different bridged `USDT.e` at `0xaa79…8f46`. It took on-chain inspection to confirm which token to build against and what it supports.
- **Getting test USDT.** The docs explain the WBT faucet (0.5 WBT/day per GitHub account) but not how to get the hackathon USDT. We could only infer from explorer traces that a faucet minter mints it.
- **Faucet limits are tight for a team.** The faucet limit applies per IP as well as per account, so teammates on one venue network compete for drips. A deployer plus a relayer already needs two funded addresses.
- **`eth_getLogs` is capped at 10,000 blocks** (about 2.8 hours at 1-second blocks). The RPC limits table doesn't mention this. We found it from the error, and it changes how you build any event-based ledger or export.
- **Gas sponsorship has no guidance.** EntryPoints are preinstalled, but the docs don't say whether any bundler or paymaster serves Whitechain Sepolia. Reown's docs say its embedded (email/social) wallets don't work here. Every gasless design is therefore "run your own relayer", and the docs have no recipe for that.
- **Safe app and Transaction Service support for `wch-sepolia` is hard to confirm** from outside. Safe's API rejected our scripted check, so we built approval collection and execution without depending on the Safe Transaction Service.
- **Verification outage at deploy time.** Deployment succeeded, but every Blockscout verification submission (from `forge script --verify` and `forge verify-contract`) returned `{"message":"Contract verification is temporarily unavailable."}`. `GET /api/v2/smart-contracts/verification/config` listed no Solidity compiler versions. Verification is a qualification requirement, so a status note for the verifier, or a fallback, would help teams during the event.
- **Proxy slot mismatch.** The USDT proxy reports `eip1967` in Blockscout, but reading the standard EIP-1967 implementation slot over RPC returned zero for us. That was confusing while checking what we were integrating with.

## What the docs were missing

- A short "accept and pay USDT" page: the canonical test USDT address, how to get it, its EIP-712 domain (`name: "Tether USD"`, `version: "1"`), and which authorization methods it supports.
- RPC method limits beyond request rate, starting with the `eth_getLogs` block range.
- A relayer or gas-sponsorship guide: how a business funds WBT for its users, recommended fee caps, and the state of bundlers and paymasters.
- A note on which preinstalled contracts are guaranteed. They appear in the migration page's collision table, not on the network reference.
