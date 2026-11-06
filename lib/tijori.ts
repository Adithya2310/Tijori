import 'server-only';
import { createTijoriServer, fromEnv } from '@tijori/server';

// The reference app's self-hosted Tijori backend, configured from .env / .env.local (see .env.example).
export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api' });
