import { toNextHandlers } from '@tijori/server/next';
import { tijori } from '@/lib/tijori';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST, HEAD } = toNextHandlers(tijori);
