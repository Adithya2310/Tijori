// Post-build checks for published packages:
// - rewrite worker URLs that tsc leaves as '.ts' string literals (new URL('./x.ts', import.meta.url));
// - fail if any emitted JS still references a '.ts' module path;
// - ensure every source file that starts with 'use client' keeps the directive in its emitted JS;
// - copy vendored third-party files (src/vendor/*) verbatim, with their hand-written declarations.
import { chmod, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../packages/', import.meta.url).pathname;
const walk = async dir => (await readdir(dir, { withFileTypes: true })).flatMap(e => e.isDirectory() ? [] : [join(dir, e.name)]).concat(...await Promise.all((await readdir(dir, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => walk(join(dir, e.name)))));
let problems = 0;
for (const pkg of ['core', 'server', 'client', 'react']) {
 const dist = join(root, pkg, 'dist'), src = join(root, pkg, 'src');
 let files; try { files = await walk(dist); } catch { continue; }
 const vendor = join(src, 'vendor');
 for (const file of await walk(vendor).catch(() => [])) {
  const out = join(dist, relative(src, file));
  await mkdir(join(out, '..'), { recursive: true });
  await copyFile(file, out);
 }
 for (const file of files.filter(f => f.endsWith('.js'))) {
  let text = await readFile(file, 'utf8');
  const rewritten = text.replace(/new URL\((['"])(\.{1,2}\/[^'"]+)\.ts\1, import\.meta\.url\)/g, (_, q, p) => `new URL(${q}${p}.js${q}, import.meta.url)`);
  if (rewritten !== text) { text = rewritten; await writeFile(file, text); }
  if (/(from\s+|import\()\s*['"][^'"]+\.tsx?['"]|new URL\(['"][^'"]+\.tsx?['"]/.test(text)) { console.error(`TS path left in ${relative(root, file)}`); problems++; }
 }
 for (const file of (await walk(src)).filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))) {
  const source = await readFile(file, 'utf8');
  if (!/^\s*['"]use client['"]/.test(source)) continue;
  const out = join(dist, relative(src, file)).replace(/\.tsx?$/, '.js');
  const emitted = await readFile(out, 'utf8').catch(() => '');
  if (!/^\s*['"]use client['"]/.test(emitted)) { console.error(`'use client' missing in ${relative(root, out)}`); problems++; }
 }
}
// Bin targets must be executable for workspace links (npm sets the bit itself on install from the registry).
for (const pkg of ['server', 'client']) {
 const manifest = JSON.parse(await readFile(join(root, pkg, 'package.json'), 'utf8'));
 for (const target of Object.values(manifest.bin ?? {})) await chmod(join(root, pkg, target), 0o755).catch(() => { console.error(`Missing bin ${pkg}/${target}`); problems++; });
}
if (problems) { console.error(`${problems} packaging problem(s).`); process.exit(1); }
console.log('Package output checks passed.');
