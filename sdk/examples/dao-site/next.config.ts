import type { NextConfig } from 'next';

// Nothing Tijori-specific is required: the packages are plain ESM and the on-device worker is bundled automatically.
// Cache the pinned, immutable model assets aggressively.
const config: NextConfig = {
 async headers() {
  return [{ source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
 },
};
export default config;
