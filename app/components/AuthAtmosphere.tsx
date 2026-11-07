'use client';

import dynamic from 'next/dynamic';

// Decorative pale-blue WebGL slats (ogl). Loaded only in the browser; the parent's gradient shows without WebGL.
// Never required for any action; reduced motion is handled by the component and the CSS.
const MicroSlats = dynamic(() => import('./MicroSlats'), { ssr: false });

export default function AuthAtmosphere({ className = 'tj-auth-ambient' }: { className?: string }) {
 return <div className={className} aria-hidden="true">
  <MicroSlats preset="tide" slatWidth={5} slatHeight={13} gap={5} roundness={0.75}
   speed={0.25} glint={0.3} contrast={0.65} fog={0.7}
   cursorStrength={0.3} cursorSize={24} trail={0.7} swirl={0} lean={0} intro={false} />
 </div>;
}
