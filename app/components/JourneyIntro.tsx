'use client';

import type { ReactNode } from 'react';

/** CSS carries one compact entrance; both review and normal URLs share it. */
export default function JourneyIntro({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className="journey-sequence" data-active={active}>{children}</div>;
}
