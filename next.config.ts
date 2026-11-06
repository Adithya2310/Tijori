import type { NextConfig } from 'next';
import { lanAddresses } from './lib/local-network.mjs';
const nextConfig: NextConfig = {
 async headers() {
  return [
   // Cross-origin isolation lets the on-device object models use several CPU threads (about 3x faster). `credentialless`
   // keeps cross-origin no-cors loads working; Safari ignores it and simply stays on one thread.
   { source: '/:path*', headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }, { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }] },
   { source: '/tijori-assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];
 },
 ...(process.env.TIJORI_PHONE_DEV === '1' ? {distDir:process.env.TIJORI_PHONE_MODE === 'production'?'.next-phone-build':'.next-phone',allowedDevOrigins:lanAddresses().map(item=>item.address)} : {}),
};
export default nextConfig;
