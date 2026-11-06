import 'server-only';
import { createTijoriServer, fromEnv } from '@tijori/server';

// The app's self-hosted Tijori backend (@tijori/server from npm), configured from .env / .env.local (see .env.example).
export const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api' });
