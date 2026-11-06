'use client';
// Developer tool: collect labelled scanner v2 descriptors to calibrate the matching threshold.
// Photos never leave the browser; only compact descriptors are kept (in this browser) and downloaded.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ObjectCapture } from '@tijori/react';
import { configureAssets, preloadObjectModels, type ObjectScanResult, type RuntimeChoice } from '@tijori/client';
import { DINO_MODEL, DINO_REVISION } from '@tijori/core/dino';
import { packObjectView, unpackObjectView } from '@tijori/core/object-profile';
import { compareObjectViews, OBJECT_MATCH_CLS_WEIGHT, OBJECT_MATCH_THRESHOLD } from '@tijori/core/object-match';

/** `grid`: 16 × 16 coverage of what was isolated (a coarse silhouette for diagnostics, no pixels). */
type Sample = { label: string; category: string; view: string; at: string; objectFraction?: number; grid?: string };
const silhouette = (grid?: number[]) => grid ? grid.map(v => Math.min(9, Math.floor(v * 10))).join('') : undefined;
const STORE = 'tj-object-lab-v2';
// Open the lab with ?gpu to try the opt-in WebGPU runtime and compare it with the CPU (descriptors should agree closely).
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('gpu')) configureAssets({ accelerator: 'webgpu' });
// Samples live in localStorage (this browser only), read through an external store so server and client agree.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const readRaw = () => localStorage.getItem(STORE) ?? '[]';
const writeSamples = (next: Sample[]) => { localStorage.setItem(STORE, JSON.stringify(next)); listeners.forEach(listener => listener()); };

export default function ObjectLab() {
 const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
 const samples = useMemo<Sample[]>(() => { try { return JSON.parse(raw); } catch { return []; } }, [raw]);
 // Read the store fresh: captures finish asynchronously, after later renders.
 const setSamples = (update: (list: Sample[]) => Sample[]) => { let current: Sample[] = []; try { current = JSON.parse(readRaw()); } catch { /* start fresh */ } writeSamples(update(current)); };
 const [label, setLabel] = useState(''), [category, setCategory] = useState('');
 const [current, setCurrent] = useState<ObjectScanResult | null>(null), [saved, setSaved] = useState('');
 // Shares ObjectCapture's preload; shows which runtime this browser uses (descriptors are the same on every runtime).
 const [runtime, setRuntime] = useState<RuntimeChoice | null | undefined>(undefined);
 useEffect(() => { let live = true; void preloadObjectModels().then(choice => { if (live) setRuntime(choice); }); return () => { live = false; }; }, []);
 const latest = samples.at(-1);
 // Best score of the latest photo against each label's other photos: its own label should win clearly.
 const scores = useMemo(() => {
  if (!latest) return [];
  const probe = unpackObjectView(latest.view);
  const byLabel = new Map<string, { score: number; cls: number; fg: number; category: string }>();
  samples.slice(0, -1).forEach(sample => {
   const result = compareObjectViews(unpackObjectView(sample.view), probe, OBJECT_MATCH_CLS_WEIGHT);
   const best = byLabel.get(sample.label);
   if (!best || result.score > best.score) byLabel.set(sample.label, { ...result, category: sample.category });
  });
  return [...byLabel.entries()].sort((a, b) => b[1].score - a[1].score);
 }, [samples, latest]);
 const counts = samples.reduce<Record<string, number>>((all, s) => ({ ...all, [s.label]: (all[s.label] ?? 0) + 1 }), {});
 function save() {
  if (!current || !label.trim()) return;
  setSamples(list => [...list, { label: label.trim(), category: (category.trim() || label.trim()).toLowerCase(), view: packObjectView(current.descriptor), at: new Date().toISOString(), objectFraction: Math.round(current.objectFraction * 1000) / 1000, grid: silhouette(current.grid) }]);
  setSaved(`Saved photo ${(counts[label.trim()] ?? 0) + 1} of ${label.trim()}. Open the camera for the next one.`); setCurrent(null);
 }
 function download() {
  const data = { version: 2, model: DINO_MODEL, revision: DINO_REVISION, encoding: 'dinov2-fg-q8', samples };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `tijori-object-calibration-${samples.length}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
 }
 return <main className="tj-root" style={{ minHeight: '100vh', padding: '32px 6vw' }}>
  <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 18 }}>
   <div><div className="tj-section-kicker">TIJORI · OBJECT LAB</div><h1 style={{ fontFamily: 'var(--tj-font-display, serif)', fontWeight: 400 }}>Calibrate object matching</h1>
    <p className="tj-form-hint">Photograph 4–6 everyday objects, including two of the same kind (for example two different bottles). Take about 4 photos of each from different sides and angles, with the whole object inside the circle (not touching its edge). Check the cut-out after each photo: it should show only the object; retake (Undo last photo) if it includes your hand or face. Use a new label per object and the same category for objects of the same kind. Only compact descriptors are stored in this browser, never photos.</p></div>
   <div className="tj-details"><div><span>Label (this exact object)</span><strong><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. blue-bottle" /></strong></div><div><span>Category</span><strong><input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. bottle" /></strong></div></div>
   <ObjectCapture mode="photo" disabled={!label.trim()} onResult={results => { setCurrent(results?.[0] ?? null); if (results) setSaved(''); }} />
   {!label.trim() && <p className="tj-form-hint">Enter a label first.</p>}
   <button className="tj-primary" disabled={!current || !label.trim()} onClick={save}>{current ? `Save this photo as ${label.trim() || '…'}` : 'Save this photo'}</button>
   {saved && <p className="tj-form-hint" role="status">{saved}</p>}
   {latest && scores.length > 0 && <div className="tj-details"><div><span>Latest photo</span><strong>{latest.label}</strong></div>
    {scores.map(([name, s]) => <div key={name}><span>{name === latest.label ? 'Same object' : s.category === latest.category ? 'Same kind, different object' : 'Different object'} · {name}</span><strong style={{ color: s.score >= OBJECT_MATCH_THRESHOLD ? (name === latest.label ? '#7fd8a8' : '#ff8f9a') : undefined }}>{s.score.toFixed(3)} (cls {s.cls.toFixed(2)}, object {s.fg.toFixed(2)})</strong></div>)}</div>}
   <div className="tj-details">{Object.entries(counts).map(([name, n]) => <div key={name}><span>{name}</span><strong>{n} photo{n === 1 ? '' : 's'}</strong></div>)}<div><span>Total</span><strong>{samples.length} photos, {Object.keys(counts).length} objects</strong></div></div>
   <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="tj-primary" disabled={!samples.length} onClick={download}>Download calibration set</button><button className="tj-light-btn" disabled={!samples.length} onClick={() => setSamples(list => list.slice(0, -1))}>Undo last photo</button><button className="tj-light-btn" disabled={!samples.length} onClick={() => { if (confirm('Delete all samples?')) setSamples(() => []); }}>Clear all</button></div>
   <p className="tj-form-hint">Current setting: match when the score is at least {OBJECT_MATCH_THRESHOLD} (CLS weight {OBJECT_MATCH_CLS_WEIGHT}). Green = the same object would log in; red = a different object would wrongly log in.</p>
   <p className="tj-form-hint" data-runtime={runtime ? `${runtime.device}:${runtime.threads}` : ''}>On-device runtime: {runtime ? `${runtime.device === 'webgpu' ? 'WebGPU for object isolation' : 'CPU only'}, ${runtime.threads} CPU thread${runtime.threads === 1 ? '' : 's'}` : runtime === null ? 'unavailable (models load when you take a photo)' : 'loading…'}</p>
  </div>
 </main>;
}
