'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * One step of a guided flow. When `step` changes it focuses the step heading, scrolls the step content to the top,
 * keeps the primary action in view on phones and plays a short directional entrance (skipped for keyboard users,
 * reduced to a fade with reduced motion). The pinned action never moves.
 */
export default function FlowPanel({ step, direction = 1, focus = true, animate = true, children }: {
 step: string; direction?: number; focus?: boolean; animate?: boolean; children: ReactNode;
}) {
 const panel = useRef<HTMLDivElement>(null);
 useLayoutEffect(() => {
  const element = panel.current;
  if (!element) return;
  if (focus) {
   element.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true });
   const content = element.querySelector<HTMLElement>('.tj-flow-content');
   if (content) content.scrollTop = 0;
   if (window.matchMedia('(max-width: 959px)').matches) {
    const action = element.querySelector<HTMLElement>('[data-primary-action]');
    const rect = action?.getBoundingClientRect(), viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0, bottom = top + (viewport?.height ?? window.innerHeight);
    if (rect && (rect.bottom > bottom - 16 || rect.top < top + 16)) action?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
   }
  }
  if (!animate || document.documentElement.dataset.input === 'keyboard' || typeof element.animate !== 'function') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = element.querySelector('.tj-flow-content') ?? element;
  const parts = Array.from(target.children);
  const animations = (parts.length ? parts : [target]).map((part, index) => part.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [
   { opacity: 0, transform: `translateX(${direction * 10}px)` },
   { opacity: 1, transform: 'translateX(0)' },
  ], { duration: reduce ? 150 : 200, delay: reduce ? 0 : Math.min(index, 2) * 35, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'backwards' }));
  return () => animations.forEach(animation => animation.cancel());
 }, [step, direction, focus, animate]);
 return <div ref={panel} className="tj-flow-panel">{children}</div>;
}
