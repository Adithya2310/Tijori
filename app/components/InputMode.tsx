'use client';

import { useEffect } from 'react';

export default function InputMode() {
 useEffect(() => {
  const pointer = () => { document.documentElement.dataset.input = 'pointer'; };
  const keyboard = () => { document.documentElement.dataset.input = 'keyboard'; };
  document.documentElement.dataset.input ??= 'pointer';
  document.addEventListener('pointerdown', pointer, { passive: true });
  document.addEventListener('keydown', keyboard);
  return () => {
   document.removeEventListener('pointerdown', pointer);
   document.removeEventListener('keydown', keyboard);
  };
 }, []);
 return null;
}
