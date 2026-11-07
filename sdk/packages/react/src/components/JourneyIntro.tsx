'use client';
import type { ReactNode } from 'react';

/** Wraps the sign-in journey; CSS plays one compact entrance when the guided steps start. */
export default function JourneyIntro({ active, children }: { active: boolean; children: ReactNode }) {
 return <div className="tj-journey-sequence" data-active={active}>{children}</div>;
}
