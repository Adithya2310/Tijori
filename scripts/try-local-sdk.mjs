// Try unpublished SDK changes in this app before releasing them.
// Builds sdk/, packs @tijori/core, server, client and react into .sdk-local/ and installs those tarballs over the
// registry versions WITHOUT touching package.json or package-lock.json. Run `npm ci` to return to the registry.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sdk = join(root, 'sdk'), out = join(root, '.sdk-local');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) => { const result = spawnSync(npm, args, { cwd, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status ?? 1); };

rmSync(out, { recursive: true, force: true }); mkdirSync(out);
run(['run', 'build'], sdk);
run(['pack', '--pack-destination', out, ...['core', 'server', 'client', 'react'].flatMap(name => ['-w', `@tijori/${name}`])], sdk);
const tarballs = readdirSync(out).filter(file => file.endsWith('.tgz')).map(file => join(out, file));
run(['install', '--no-save', ...tarballs], root);
console.log(`\nThe app now uses your local SDK build (${tarballs.length} packages). Run \`npm ci\` to go back to the published versions.`);
