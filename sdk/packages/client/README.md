# @tijori/client

Browser building blocks for a self-hosted [`@tijori/server`](https://www.npmjs.com/package/@tijori/server). Use it directly from any framework; [`@tijori/react`](https://www.npmjs.com/package/@tijori/react) builds on it.

```ts
import { createTijoriClient, configureAssets, extractObjectFeatures, loadAcousticModem } from '@tijori/client';

configureAssets({ assetBaseUrl: '/tijori-assets/' });
const tijori = createTijoriClient({ baseUrl: '/api/tijori/v1' });
const features = await extractObjectFeatures(photo, { point: { x: 0.5, y: 0.5 }, onProgress: console.log });
const { playChallengeTone, startAcousticListener } = await loadAcousticModem();
```

- **`createTijoriClient`:** a typed client for every `/v1` endpoint (state, identities, vaults, proposals, approval sessions, invoices, proximity). Errors are `TijoriError` with an HTTP `status`.
- **`extractObjectFeatures`:** on-device SlimSAM and DINOv2 in a module worker, with an in-page fallback, abort and timeouts. Photos never leave the browser.
- **Identities:** remembered object identities, the insecure demo recovery file and the in-memory session signer.
- **`loadAcousticModem`:** ggwave over Web Audio (vendored ESM build; no bundler aliases needed).
- **Model assets:** `npx tijori-client prepare-assets public/tijori-assets` downloads the pinned, checksum-verified DINOv2 and SlimSAM models and copies the matching ONNX Runtime WASM (about 100 MB, resumable). Serve that directory statically.

For Vite, add `optimizeDeps.exclude: ['@tijori/client', '@huggingface/transformers']` and `worker.format: 'es'`.

The object match is an experimental, bypassable demo check, not authentication. See the [integration guide](https://github.com/Adithya2310/Tijori/blob/main/docs/SDK.md).
