import type { NextConfig } from 'next';

// Nothing Tijori-specific is required: the packages are plain ESM and the on-device worker is bundled automatically.
// Optional speed-ups: cross-origin isolation lets the on-device models use several CPU threads, and the pinned,
// immutable model assets can be cached aggressively.
const config: NextConfig = {
 async headers() {
  return [
   { source: '/:path*', headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }, { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }] },
   { source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];
 },
};
export default config;
