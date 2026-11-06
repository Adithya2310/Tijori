'use client';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTijori } from '../context.tsx';

/** Overlay dialog in the Tijori style. Shows the shared Tijori error inside the dialog. */
export function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
 const { error } = useTijori();
 return <div className="tj-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
  <div className="tj-modal" role="dialog" aria-modal="true" aria-label={label}>
   <button className="tj-modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
   {children}
   {error && <div className="tj-error tj-modal-error">{error}</div>}
  </div>
 </div>;
}
