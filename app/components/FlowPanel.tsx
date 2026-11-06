'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep the action anchored while only the step content changes. */
export default function FlowPanel({ step, direction = 1, focus = true, animate = true, children }: {
  step: string; direction?: number; focus?: boolean; animate?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (focus) {
      element.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true });
      const content = element.querySelector<HTMLElement>('.flow-content');
      if (content) content.scrollTop = 0;
      // Laptop actions are pinned by layout. On phones, scroll only if needed.
      if (window.matchMedia('(max-width: 959px)').matches) {
        const action = element.querySelector<HTMLElement>('[data-primary-action]');
        const rect = action?.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? window.innerHeight);
        if (rect && (rect.bottom > bottom - 16 || rect.top < top + 16)) {
          action?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
      }
    }
    if (!animate || document.documentElement.dataset.input !== 'pointer') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = element.querySelector('.flow-content') ?? element;
    // The pinned action stays still; the new chapter arrives in a short sequence.
    const parts = Array.from(target.children);
    const animations = (parts.length ? parts : [target]).map((part, index) => part.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: 0, transform: `translateX(${direction * 10}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: reduce ? 150 : 200, delay: reduce ? 0 : Math.min(index, 2) * 35, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'backwards' }));
    return () => animations.forEach(animation => animation.cancel());
  }, [step, direction, focus, animate]);
  return <div ref={panel} className="flow-panel">{children}</div>;
}
