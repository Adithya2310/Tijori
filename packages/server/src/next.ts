// Next.js App Router adapter:  export const { GET, POST } = toNextHandlers(server)
import { after } from 'next/server.js';
import type { TijoriServer } from './server.ts';

export function toNextHandlers(server: TijoriServer) {
 const handler = (request: Request) => server.fetch(request, { waitUntil: work => after(work) });
 return { GET: handler, POST: handler, HEAD: handler };
}
/** Route segment config to re-export from the route file: Node runtime, never cached. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
