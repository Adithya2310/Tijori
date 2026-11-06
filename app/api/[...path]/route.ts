import { toNextHandlers } from '@tijori/server/next';
import { tijori } from '@/lib/tijori';

// Every /api/* and /api/v1/* endpoint (including /api/proximity) is served by @tijori/server.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST, HEAD } = toNextHandlers(tijori);
