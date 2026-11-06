# Tijori SDK integration guide

Add Tijori's co-present treasury to your own DAO site, marketplace or community app. Your users get:

- **Object sign-up and sign-in.** The camera and on-device DINOv2 matching run in the browser; photos never leave the device.
- **Whitechain vaults.** Each vault is a gasless Safe with the Tijori presence guard, holding USDT. Payouts need a majority of signers to approve together in one session.
- **Treasury tools.** Payout proposals, a vendor invoice inbox with signed webhooks, CSV export and a relayer gas tank.
- **Acoustic proof of attendance.** A two-minute ultrasound or audible challenge, broadcast on one device and heard by the others.

> **Prototype.** This is a hackathon-grade demo on testnets. The HTTP API is unauthenticated. The object check runs on your server and tells different objects apart, but it is not authentication: identical objects match, and stored profiles can unlock keys. Acoustic matches can be replayed or relayed and do not prove physical proximity. Use test tokens only, never real funds or personal data, and do not expose the API publicly. The repository [README](../README.md) states the full threat model.

## Packages

| Package | Runs in | What it gives you |
|---|---|---|
| `@tijori/server` | Node.js 22.12+ | `createTijoriServer(config)`, a fetch handler with Next.js and Node/Express adapters. It includes storage (Arkiv, local file, memory), the Whitechain relayer and verifier, and the `tijori-server` CLI. |
| `@tijori/client` | Browser | `createTijoriClient()` for the `/v1` API, plus: <ul><li>on-device object scanning (`preloadObjectModels`, `extractObjectDescriptors`)</li><li>identity storage</li><li>the acoustic modem</li><li>the `tijori-client prepare-assets` CLI</li></ul> |
| `@tijori/react` | React 19 | `<TijoriProvider>`, the drop-in `<TijoriApp/>`, composable components and hooks, and `styles.css`. |
| `@tijori/core` | Anywhere | Shared types, vault rules, EIP-712 helpers and `/v1` wire types. Installed automatically. |
| `@tijori/invoices` | Vendor's server | A zero-dependency SDK that lets vendors bill a vault and verify paid-invoice webhooks. |

All packages are ESM-only, ship TypeScript types, and are versioned together.

## Requirements

- **Self-hosted backend.**
  - Run `@tijori/server` in a long-lived Node.js process with a writable, persistent data directory. It holds the relayer journal, file locks and local storage.
  - Serverless or edge runtimes are not supported.
  - Every process that uses the same keys must share that directory.
- **HTTPS.** Browsers only allow the camera and microphone on HTTPS (or `localhost`).
- **Same origin.** Writes are accepted only from the page's own origin, so serve the UI and the API from the same site.
- **Model assets.** About 92 MB of pinned model files, prepared once and served as static files (see below). A browser downloads 53–69 MB of them once, then reads its cache.

## 1. Install

```sh
npm install @tijori/server @tijori/client @tijori/react viem
npx tijori-client prepare-assets public/tijori-assets   # downloads and checksum-verifies the models (resumable)
```

Run `prepare-assets` in your build (for example `"prebuild"`). Serve `public/tijori-assets/` with long-lived cache headers. You can also host it on a CDN and pass that URL as `assetBaseUrl`.

For fast scans:
- **Cross-origin isolation.** Send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on your pages, so the models can use several CPU threads (about 3× faster). Check that any third-party iframes and popups on those pages still work. Without these headers the models use one thread.
- **Preloading.** `<ObjectCapture>` starts loading the models when it renders (`preload={false}` turns this off). Without React, call `preloadObjectModels()` when your sign-in form opens. The models stay loaded in one worker for the whole page.
- **WebGPU (opt-in).** `configureAssets({ accelerator: 'webgpu' })` runs object isolation on the GPU when it supports 16-bit shaders (about 2× faster on a laptop), falling back to the CPU when it cannot. It is off by default because some browsers reject ONNX Runtime's WebGPU shaders.

## 2. Configure the backend

Copy the variables you need from the repository's [`.env.example`](../.env.example). `fromEnv()` reads them; older `TICHORI_*` names still work with a warning.

| Feature | Settings |
|---|---|
| Storage: local encrypted file (single machine, no credentials) | `storage: 'local'` or `TIJORI_STORAGE_MODE=local`. Optional `LOCAL_DEMO_DATA_DIR`. |
| Storage: encrypted Arkiv entity (default) | `ARKIV_ACCESS_KEY`, `ARKIV_WALLET_PRIVATE_KEY`, `ARKIV_STATE_ENCRYPTION_KEY`, `ARKIV_MAX_TOTAL_FEE_TGLM`. Run `npx tijori-server arkiv check` first. |
| Storage: tests and previews | `storage: memoryStorage()` |
| Whitechain vaults and payouts | `WHITECHAIN_RELAYER_PRIVATE_KEY` (funded with WBT), `TIJORI_VERIFIER_PRIVATE_KEY` (a separate key with no funds), `TIJORI_GUARD_ADDRESS`, `TIJORI_SAFE_SETUP_ADDRESS` |
| Vendor inbox keys and webhook secrets | `TIJORI_API_MASTER_KEY` (32 random bytes, hex) |

Settings without credentials:
- You can reuse the deployed Whitechain Sepolia contracts. Each Safe stores its own verifier, so your verifier key stays yours.
  - `TichoriPresenceGuard`: `0x117919dCBBE5E2Aed227e89dddCa2f68B399B238`
  - `TichoriSafeSetup`: `0x6905DC2c7c3cA3b2eC97A209f493e949e5bA0e54`
- Never reuse one private key for two roles.
- Keep every secret server-side: never use a `NEXT_PUBLIC_` prefix and never ship one in a client bundle.

Without Whitechain settings, everything else still works. Whitechain endpoints then answer `501`, and the UI offers acoustic groups instead of vaults.

## 3a. Next.js (App Router)

```ts
// lib/tijori.ts
import 'server-only';
import { createTijoriServer, fromEnv } from '@tijori/server';
export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api/tijori' });
```

```ts
// app/api/tijori/[...path]/route.ts
import { toNextHandlers } from '@tijori/server/next';
import { tijori } from '@/lib/tijori';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST, HEAD } = toNextHandlers(tijori);
```

```tsx
// app/layout.tsx: add once
import '@tijori/react/styles.css';

// app/treasury/page.tsx
'use client';
import { TijoriApp, TijoriProvider } from '@tijori/react';
export default function Treasury() {
  return <TijoriProvider baseUrl="/api/tijori/v1" assetBaseUrl="/tijori-assets/"><TijoriApp name="Builders DAO" /></TijoriProvider>;
}
```

Paid invoices link to a public receipt page. That page defaults to `/invoice/{id}`; change it with `createTijoriServer({ receiptPath })` and `<TijoriProvider receiptUrl>`.

```tsx
// app/invoice/[id]/page.tsx: a server component
import { InvoiceReceipt } from '@tijori/react';
import { tijori } from '@/lib/tijori';
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceReceipt invoice={await tijori.invoiceReceipt(id)} />;
}
```

[`sdk/examples/dao-site`](../examples/dao-site) is a complete, runnable version of this setup.

## 3b. Express or plain Node

```ts
import express from 'express';
import { createTijoriServer, fromEnv } from '@tijori/server';
import { toNodeHandler } from '@tijori/server/node';

const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api/tijori' });
const app = express();
app.use('/api/tijori', toNodeHandler(tijori)); // mount BEFORE body parsers: Tijori reads and limits the raw body itself
app.use(express.static('public'));               // serves /tijori-assets/
const server = app.listen(3000, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => void tijori.drain().then(() => process.exit(0)))); // finish webhook deliveries
```

Any framework with Fetch API requests (Hono, Remix, Bun, Deno and others) can call `tijori.fetch(request)` directly.

## 3c. Other frontends (Vite, Vue, Svelte, plain JS)

Use the headless client:

```ts
import { createTijoriClient, configureAssets, extractObjectDescriptors, loadAcousticModem, preloadObjectModels } from '@tijori/client';
configureAssets({ assetBaseUrl: '/tijori-assets/' });
const client = createTijoriClient({ baseUrl: '/api/tijori/v1' });
void preloadObjectModels(); // when the sign-in form opens
const [scan] = await extractObjectDescriptors([photoBlob], { onProgress: console.log }); // scan.descriptor, scan.preview
const modem = await loadAcousticModem(); // initModem / playChallengeTone / startAcousticListener
```

The object worker is created with `new Worker(new URL('./dino.worker.js', import.meta.url), { type: 'module' })`, which webpack, Turbopack and Vite bundle automatically. Vite needs two settings:
- `optimizeDeps.exclude: ['@tijori/client', '@huggingface/transformers']`
- `worker.format: 'es'`

Alternatively, import the worker yourself and pass the same `workerFactory` to `preloadObjectModels()` and `extractObjectDescriptors()`. If no worker can start, inference falls back to the page.

## Customising

| What | How |
|---|---|
| Brand and copy | `<TijoriApp name>` and `<TijoriAuth name headline tagline>` |
| Colours and fonts | The `<TijoriProvider theme>` prop:<pre>{ accent, ink, muted, line, background, font, fontDisplay }</pre>You can also set `--tj-*` CSS variables. Styles live in `@layer tijori` with `tj-` classes, so your unlayered CSS wins. |
| Your own layout | Compose the parts yourself:<ul><li>`TijoriAuth`, `ObjectSignUp`, `ObjectSignIn`</li><li>`VaultList`, `CreateVault`, `CreateAcousticGroup`</li><li>`VaultTreasury`, `AttendanceCheck`/`ProximityCheck`</li><li>`InvoiceReceipt`</li></ul>Read state with `useTijori()`, `useIdentity()` and `useVaults()`. |
| Extra UI in the drop-in app | `<TijoriApp>` slots: `authAlternative`, `renderVault`, `dashboardExtras`, `vaultExtras`, `footer` |
| Real ultrasonic presence for payouts | Wire the room code through the provider:<ul><li>`<TijoriProvider onPresenceEmit>` broadcasts the code on the initiator's device.</li><li>`presence.listen(challengeId)` resolves with the code heard on approvers' devices.</li></ul> |
| Replace verification providers | `createTijoriServer({ providers: { objectMatching, presence, physicalApproval, externalVault } })` (interfaces in `@tijori/core/integrations`) |
| React to activity | `createTijoriServer({ onEvent })` receives `vault.created`, `proposal.executed` and `invoice.paid` |
| Custom persistence | Pass a `StorageAdapter` (`{ mode, transact(work) }`) as `storage`. Writers must be serialised. |

## Vendors billing a vault

A vault member opens **Invoice inbox → Show inbox key** and gives the vendor the key, the webhook secret and the endpoint. The vendor then uses `@tijori/invoices`:

```js
import { createInvoiceClient, verifyWebhook } from '@tijori/invoices';
const tijori = createInvoiceClient({ baseUrl: 'https://dao.example', apiPath: '/api/tijori/v1', inboxKey: process.env.TIJORI_INBOX_KEY });
await tijori.create({ vendorName: 'Studio', vendorAddress: '0x…', amount: '250', dueDate: '2026-12-01', webhookUrl: 'https://studio.example/hooks/tijori' });
// On the webhook: verifyWebhook(rawBody, req.headers['tijori-signature'], process.env.TIJORI_WEBHOOK_SECRET)
```

## Upgrading

- Packages follow semver and are versioned together. Until 1.0, minor versions may change the API; check the changelog.
- **The `/v1` wire format is stable.** Persisted data (the encrypted vault aggregate, browser identity records, session keys) changes only through explicit, additive migrations.
- **Legacy identifiers stay.** The persisted identifiers in `@tijori/core/legacy` keep their original spelling, so existing identities and data keep working across upgrades.
- **Deprecated aliases** work until 2.0:
  - `TICHORI_*` settings
  - `createTichoriClient`
  - `TichoriError`
  - the `tichori:presence-emit` event
  - `window.tichoriPresence`
  - the `Tichori-Signature` webhook header
