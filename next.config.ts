import type { NextConfig } from 'next';
import { lanAddresses } from './lib/local-network.mjs';
const nextConfig: NextConfig = {
 async headers() {
  return [{ source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
 },
 ...(process.env.TICHORI_PHONE_DEV === '1' ? {distDir:process.env.TICHORI_PHONE_MODE === 'production'?'.next-phone-build':'.next-phone',allowedDevOrigins:lanAddresses().map(item=>item.address)} : {}),
};
export default nextConfig;
