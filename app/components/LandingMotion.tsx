'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Each illustration tells its story once, when the illustration itself is visible. */
export default function LandingMotion({ children }: { children: ReactNode }) {
 const root = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const element = root.current;
  if (!element) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const easing = getComputedStyle(element).getPropertyValue('--ease-out').trim();
  const animations = new Set<Animation>();
  const play = (target: Element | null, frames: Keyframe[], duration = 600, delay = 0) => {
   if (!target) return;
   const animation = target.animate(frames, { duration, delay, easing, fill: 'backwards' });
   animations.add(animation);
   animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  };
  const arrive = (target: Element | null, from: string, to = 'none', duration = 500, delay = 0) => {
   play(target, [{ opacity: 0, transform: from }, { opacity: 1, transform: to }], duration, delay);
  };
  const revealScene = (scene: HTMLElement) => {
   if (document.documentElement.dataset.input === 'keyboard') return;
   if (reduce.matches) {
    play(scene, [{ opacity: .65 }, { opacity: 1 }], 150);
    return;
   }
   const find = (selector: string) => scene.querySelector(selector);
   const each = (selector: string, action: (item: Element, index: number) => void) => scene.querySelectorAll(selector).forEach(action);
   switch (scene.dataset.motionScene) {
    case 'hero':
     arrive(find('.hero-receipt'), 'translateY(24px) rotate(-11deg)', 'translateY(0) rotate(-7deg)', 700, 100);
     arrive(find('.hero-floating-note'), 'translateY(12px) rotate(9deg)', 'translateY(0) rotate(6deg)', 600, 160);
     each('.receipt-members .landing-people>span', (person, index) => {
      const rotation = [-6, 5, -3][index];
      arrive(person, `translateY(8px) rotate(${rotation}deg)`, `translateY(0) rotate(${rotation}deg)`, 300, 220 + index * 60);
     });
     each('.receipt-votes>span', (vote, index) => arrive(vote, 'translateY(6px)', 'translateY(0)', 300, 340 + index * 60));
     break;
    case 'object':
     arrive(find('.bottle-drawing'), 'translateY(14px) rotate(-17deg)', 'translateY(0) rotate(-12deg)', 650);
     each('.scan-corner', (corner, index) => {
      const x = index % 2 === 0 ? -8 : 8;
      const y = index < 2 ? -8 : 8;
      arrive(corner, `translate(${x}px, ${y}px)`, 'translate(0, 0)', 500, 60);
     });
     play(find('.scan-sweep'), [
      { opacity: 0, transform: 'translateY(0)' },
      { opacity: .8, transform: 'translateY(30px)', offset: .18 },
      { opacity: .8, transform: 'translateY(160px)', offset: .8 },
      { opacity: 0, transform: 'translateY(200px)' },
     ], 1000, 180);
     arrive(find('.scan-caption'), 'translateY(6px)', 'translateY(0)', 300, 360);
     break;
    case 'people':
     arrive(find('.approval-sheet'), 'translateX(-50%) translateY(20px) rotate(-8deg)', 'translateX(-50%) translateY(0) rotate(-5deg)', 650);
     each('.approval-person', (person, index) => arrive(person, 'translateY(8px)', 'translateY(0)', 350, 100 + index * 70));
     each('.approval-check', (check, index) => arrive(check, 'scale(.95)', 'scale(1)', 240, 240 + index * 70));
     arrive(find('.approval-summary'), 'translateY(6px)', 'translateY(0)', 300, 380);
     break;
    case 'signal':
     arrive(find('.signal-core'), 'scale(.95) rotate(-12deg)', 'scale(1) rotate(-7deg)', 500);
     each('.signal-ring', (ring, index) => arrive(ring, 'scale(.85)', 'scale(1)', 800, 60 + index * 80));
     each('.signal-person', (person, index) => arrive(person, 'translateY(8px) scale(.95)', 'translateY(0) scale(1)', 350, 180 + index * 80));
     arrive(find('.signal-art-caption'), 'translateY(6px)', 'translateY(0)', 300, 340);
     break;
    case 'steps':
     each(':scope>div', (step, index) => arrive(step, 'translateY(12px)', 'translateY(0)', 500, index * 70));
     break;
    case 'final':
     arrive(find('.landing-kicker'), 'translateY(8px)', 'translateY(0)', 400);
     each('h2>span', (line, index) => arrive(line, 'translateY(18px)', 'translateY(0)', 650, 60 + index * 70));
     arrive(find('.final-bottom'), 'translateY(10px)', 'translateY(0)', 500, 200);
     arrive(find('.final-spark'), 'rotate(-20deg) scale(.95)', 'rotate(0deg) scale(1)', 800, 100);
     break;
   }
  };
  const contentObserver = new IntersectionObserver(entries => {
   entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    (entry.target as HTMLElement).dataset.visible = 'true';
    contentObserver.unobserve(entry.target);
   });
  }, { threshold: .12 });
  element.querySelectorAll<HTMLElement>('[data-reveal]').forEach(item => {
   if (item.getBoundingClientRect().top < window.innerHeight * .95) item.dataset.visible = 'true';
   else item.dataset.pending = 'true';
   contentObserver.observe(item);
  });
  const sceneObserver = new IntersectionObserver(entries => {
   entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    revealScene(entry.target as HTMLElement);
    sceneObserver.unobserve(entry.target);
   });
  }, { threshold: .2 });
  element.querySelectorAll<HTMLElement>('[data-motion-scene]').forEach(scene => sceneObserver.observe(scene));
  const settle = () => animations.forEach(animation => animation.cancel());
  const visibility = () => animations.forEach(animation => document.hidden ? animation.pause() : animation.play());
  // A key press immediately settles decoration so focus never waits for motion.
  document.addEventListener('keydown', settle);
  document.addEventListener('visibilitychange', visibility);
  reduce.addEventListener('change', settle);
  return () => {
   contentObserver.disconnect();
   sceneObserver.disconnect();
   document.removeEventListener('keydown', settle);
   document.removeEventListener('visibilitychange', visibility);
   reduce.removeEventListener('change', settle);
   settle();
  };
 }, []);
 return <div ref={root} className="landing-motion">{children}</div>;
}
