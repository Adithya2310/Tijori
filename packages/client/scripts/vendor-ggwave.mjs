// Regenerates src/vendor/ggwave.js from the upstream ggwave npm build as a browser-friendly ES module.
// Usage (repo root, with ggwave installed as a dev dependency): node packages/client/scripts/vendor-ggwave.mjs
// The upstream file is checksum-pinned; update UPSTREAM_SHA256 only after reviewing a new ggwave release.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const UPSTREAM_VERSION = '0.4.0';
const UPSTREAM_SHA256 = 'f3792b5c185345a35a935ca68a5064b97f979d13fbba0062ff16f6b3b31a6113';
const require = createRequire(import.meta.url);
const sourcePath = require.resolve('ggwave/ggwave.js');
const source = await readFile(sourcePath, 'utf8');
const digest = createHash('sha256').update(source).digest('hex');
if (digest !== UPSTREAM_SHA256) throw new Error(`ggwave.js checksum ${digest} does not match the pinned ${UPSTREAM_VERSION} build.`);

const replacements = [
 // The WASM binary is embedded as a data: URI, so no file system access is ever needed. Removing the Node
 // require() calls lets every bundler consume this file without fs/path aliases.
 ['scriptDirectory=require("path").dirname(scriptDirectory)+"/"', 'scriptDirectory=""'],
 ['scriptDirectory=__dirname+"/"', 'scriptDirectory=""'],
 ['requireNodeFS=(()=>{if(!nodePath){fs=require("fs");nodePath=require("path")}})', 'requireNodeFS=(()=>{throw new Error("ggwave: loading files is not supported in this build")})'],
];
let output = source;
for (const [from, to] of replacements) {
 if (output.split(from).length !== 2) throw new Error(`Expected exactly one occurrence of: ${from}`);
 output = output.replace(from, to);
}
const umd = output.indexOf("if (typeof exports === 'object' && typeof module === 'object')");
if (umd < 0) throw new Error('Could not find the UMD export block.');
output = output.slice(0, umd).trimEnd() + '\nexport default ggwave_factory;\n';
if (/\brequire\(/.test(output)) throw new Error('A require() call remains in the vendored build.');

const header = `// ggwave ${UPSTREAM_VERSION} (https://github.com/ggerganov/ggwave), vendored as an ES module by
// packages/client/scripts/vendor-ggwave.mjs from the npm build (sha256 ${UPSTREAM_SHA256}).
// Do not edit by hand. Changes: Node-only require() of fs/path removed; UMD footer replaced by an ES export.
//
// MIT License. Copyright (c) 2020 Georgi Gerganov.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of
// the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
// CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
/* eslint-disable */
`;
const target = new URL('../src/vendor/ggwave.js', import.meta.url);
await writeFile(target, header + output);
console.log(`Wrote ${target.pathname} (${((header.length + output.length) / 1024).toFixed(0)} KiB).`);
