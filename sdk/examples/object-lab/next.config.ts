import type { NextConfig } from 'next';
const config: NextConfig = {
 async headers() {
  return [{ source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
 },
};
export default config;
