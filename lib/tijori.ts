import 'server-only';
import { createTijoriServer, fromEnv } from '@tijori/server';

// The app's self-hosted Tijori backend (@tijori/server from npm), configured from .env / .env.local (see .env.example).
// Isolate this branch's new records from main. Explicit local mode remains available for tests.
export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api', arkiv: { namespace: 'tichori-finalize-v1' } });
