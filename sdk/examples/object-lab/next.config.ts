import type { NextConfig } from 'next';
const config: NextConfig = {
 async headers() {
  return [
   // Cross-origin isolation lets the on-device models use several CPU threads (SharedArrayBuffer).
   { source: '/:path*', headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }, { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }] },
   { source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];
 },
};
export default config;
