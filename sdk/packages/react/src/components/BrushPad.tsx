'use client';
import { useEffect, useRef, useState } from 'react';
import type { BrushStroke, ObjectBrush } from '@tijori/client';

/** Brush radius as a fraction of the photo's shorter side. */
const RADIUS = 0.035;

export type BrushPadProps = {
 /** The photo to paint on (stays in this browser). */
 photo: Blob;
 /** Called with the strokes when the user confirms. */
 onDone: (brush: ObjectBrush) => void;
 onCancel: () => void;
};

/** Paint over the object in a photo (finger or mouse) to tell the scanner exactly what to register. */
export default function BrushPad({ photo, onDone, onCancel }: BrushPadProps) {
 const canvas = useRef<HTMLCanvasElement>(null), image = useRef<HTMLImageElement | null>(null), drawing = useRef(false);
 // Strokes live in a ref (pointer events arrive faster than renders); `count` re-renders the buttons.
 const strokes = useRef<BrushStroke[]>([]), [count, setCount] = useState(0);
 const update = (next: BrushStroke[]) => { strokes.current = next; setCount(next.length); redraw(next); };
 const redraw = (list: BrushStroke[]) => {
  const c = canvas.current, img = image.current; if (!c || !img) return;
  const ctx = c.getContext('2d'); if (!ctx) return;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(96, 150, 255, 0.55)'; ctx.fillStyle = 'rgba(96, 150, 255, 0.55)';
  ctx.lineWidth = RADIUS * 2 * Math.min(c.width, c.height);
  for (const stroke of list) {
   ctx.beginPath(); stroke.forEach((p, i) => (i ? ctx.lineTo(p.x * c.width, p.y * c.height) : ctx.moveTo(p.x * c.width, p.y * c.height)));
   if (stroke.length === 1) { ctx.arc(stroke[0].x * c.width, stroke[0].y * c.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.stroke();
  }
 };
 useEffect(() => {
  const url = URL.createObjectURL(photo), img = new Image();
  img.onload = () => {
   const c = canvas.current; if (!c) return;
   const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
   c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
   image.current = img; c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  };
  img.src = url;
  return () => URL.revokeObjectURL(url);
 }, [photo]);
 const at = (event: React.PointerEvent<HTMLCanvasElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
 };
 return <div className="tj-brush-pad">
  <p className="tj-form-hint">Paint over your object with your finger or mouse. Cover the whole object, and avoid your hand and the background.</p>
  <canvas ref={canvas} className="tj-brush-canvas" aria-label="Photo: paint over your object"
   onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; update([...strokes.current, [at(event)]].slice(-50)); }}
   onPointerMove={event => { if (!drawing.current) return; const list = strokes.current; update([...list.slice(0, -1), [...(list.at(-1) ?? []), at(event)].slice(-2000)]); }}
   onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }}/>
  <div className="tj-camera-actions">
   <button type="button" className="tj-primary" disabled={!count} onClick={() => onDone({ strokes: strokes.current, radius: RADIUS })}>Use my brushing</button>
   <button type="button" className="tj-light-btn" disabled={!count} onClick={() => update([])}>Clear</button>
   <button type="button" className="tj-light-btn" onClick={onCancel}>Cancel</button>
  </div>
 </div>;
}
