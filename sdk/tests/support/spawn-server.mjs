import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serve = fileURLToPath(new URL('./serve.mjs', import.meta.url));
/** Start the test host for the local @tijori/server source on 127.0.0.1:<port>. */
export const startServer = (port, env) => spawn(process.execPath, ['--conditions=@tijori/source', '--experimental-strip-types', serve, String(port)], { env, stdio: 'ignore' });
