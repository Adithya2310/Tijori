// Node.js / Express adapter:  app.use('/api/tijori', toNodeHandler(server))  (mount before body parsers)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { TijoriServer } from './server.ts';

type NodeRequest = IncomingMessage & { originalUrl?: string };
export function toNodeHandler(server: TijoriServer) {
 return async (req: NodeRequest, res: ServerResponse, next?: (error?: unknown) => void) => {
  try {
   const protocol = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
   const url = new URL(req.originalUrl ?? req.url ?? '/', `${protocol}://${req.headers.host ?? 'localhost'}`);
   const headers = new Headers();
   for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
   const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
   const request = new Request(url, { method: req.method, headers, ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}) } as RequestInit);
   const response = await server.fetch(request);
   res.statusCode = response.status;
   response.headers.forEach((value, key) => res.setHeader(key, value));
   res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { if (next) next(error); else { res.statusCode = 500; res.end(); } }
 };
}
