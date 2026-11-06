import type { NextConfig } from 'next';
import { lanAddresses } from './lib/local-network.mjs';
const nextConfig: NextConfig = {
 async headers() {
  return [{ source: '/dino-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
 },
 ...(process.env.TICHORI_PHONE_DEV === '1' ? {distDir:process.env.TICHORI_PHONE_MODE === 'production'?'.next-phone-build':'.next-phone',allowedDevOrigins:lanAddresses().map(item=>item.address)} : {}),
 turbopack: {
  resolveAlias: {
   fs: { browser: './lib/browser-empty.js' },
   path: { browser: './lib/browser-empty.js' },
  },
 },
};
export default nextConfig;
