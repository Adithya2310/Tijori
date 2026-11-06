import Link from 'next/link';

export function TreasureChestIcon() {
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M3 11V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3M3 11h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>
  <path d="M7 5v15M17 5v15M3 11h6m6 0h6"/>
  <rect x="9" y="9" width="6" height="5" rx="1" fill="var(--surface-solid-action)"/>
  <path d="M12 11v1"/>
 </svg>;
}


export default function Brand({ className = '' }: { className?: string }) {
 return <Link href="/" className={`tijori-brand ${className}`} aria-label="Tijori home"><span className="brand-mark"><TreasureChestIcon/></span><span>Tijori</span></Link>;
}
