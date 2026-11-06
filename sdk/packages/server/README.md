# @tijori/server

The self-hosted Tijori backend. It covers object identities, gasless Whitechain vaults with co-present approvals, the vendor invoice inbox and acoustic attendance. It is exposed as a Fetch API handler, with Next.js and Node/Express adapters.

```ts
import { createTijoriServer, fromEnv } from '@tijori/server';
import { toNextHandlers } from '@tijori/server/next';   // or: import { toNodeHandler } from '@tijori/server/node'

export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api/tijori' });
export const { GET, POST, HEAD } = toNextHandlers(tijori); // app/api/tijori/[...path]/route.ts
```

- **Storage:**
  - `'arkiv'` (default): an encrypted aggregate entity on Arkiv.
  - `'local'`: an encrypted file.
  - `memoryStorage()`, or your own `StorageAdapter`.
- **Configuration:** Structured `TijoriServerConfig` fields or environment settings, read through `fromEnv()`. Older `TICHORI_*` names still work.
- **Hooks:**
  - `providers` replaces object, presence, physical-approval or external-vault verification.
  - `onEvent` receives `vault.created`, `proposal.executed` and `invoice.paid`.
  - `waitUntil` (the Next adapter passes `after`) and `drain()` keep background webhook delivery alive.
- **CLI:** `npx tijori-server arkiv check|migrate|verify-write`.

Requires Node.js 22.12+ in a long-lived process with a persistent data directory (no serverless or edge). The API is unauthenticated demo software; do not expose it publicly or use real funds.

See the [integration guide](https://github.com/Adithya2310/Tijori/blob/main/docs/SDK.md) and the [`/v1` API reference](https://github.com/Adithya2310/Tijori/blob/main/docs/API.md).
