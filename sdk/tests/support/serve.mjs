// Minimal Node host for @tijori/server used by the SDK flow tests. Run with --conditions=@tijori/source so the
// flows exercise the local package source before a release. It reads only the environment it is given
// (no .env loading), so tests stay hermetic.  Usage: node <conditions> tests/support/serve.mjs <port>
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createTijoriServer, fromEnv } from '@tijori/server';
import { toNodeHandler } from '@tijori/server/node';

// Refuse to run against anything but this workspace's source (never the app's registry copy). With the source
// condition, a fallback to node_modules already fails in Node (no type stripping there); this also catches runs
// without the condition, which would load built or published code.
if (!fileURLToPath(import.meta.resolve('@tijori/server')).endsWith('/sdk/packages/server/src/index.ts')) throw new Error('serve.mjs must test the local SDK source: run it from sdk/ with --conditions=@tijori/source.');
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) throw new Error('Usage: serve.mjs <port>');
const tijori = createTijoriServer({ ...fromEnv(), basePath: '/api' });
const server = createServer(toNodeHandler(tijori));
server.listen(port, '127.0.0.1');
const stop = async () => { server.closeAllConnections(); server.close(); await tijori.drain(); process.exit(0); };
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
