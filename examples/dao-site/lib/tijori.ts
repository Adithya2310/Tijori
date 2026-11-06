import 'server-only';
import { join } from 'node:path';
import { createTijoriServer, fromEnv } from '@tijori/server';

// A self-hosted Tijori backend for this DAO site. It uses local encrypted file storage by default, so it runs
// without Arkiv credentials; set TIJORI_STORAGE_MODE=arkiv (and the ARKIV_* settings) for shared storage.
// Add the WHITECHAIN_* / TIJORI_* settings from the repository's .env.example to enable Whitechain vaults.
const env = fromEnv();
export const tijori = createTijoriServer({
 ...env,
 basePath: '/api/tijori',
 storage: env.env?.TIJORI_STORAGE_MODE === 'arkiv' ? 'arkiv' : 'local',
 localDataDir: env.env?.LOCAL_DEMO_DATA_DIR ?? join(process.cwd(), 'data', 'tijori'),
 receiptPath: '/invoice/{id}',
 onEvent: event => console.log('[tijori event]', event.type),
});
