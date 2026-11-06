import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTypescript, globalIgnores(['.next/**', '.next-phone/**', '.next-phone-build/**', 'node_modules/**', 'next-env.d.ts', 'public/tijori-assets/**', 'contracts/**', 'packages/*/dist/**', 'examples/*/.next/**', 'examples/*/public/**', 'examples/*/next-env.d.ts'])]);
