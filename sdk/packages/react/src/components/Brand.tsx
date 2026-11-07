'use client';

/** The Tijori treasure chest, drawn for the tilted paper brand mark. */
export function TreasureChestIcon({ size = 22 }: { size?: number }) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M3 11V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3M3 11h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  <path d="M7 5v15M17 5v15M3 11h6m6 0h6" />
  <rect x="9" y="9" width="6" height="5" rx="1" fill="#fff" />
  <path d="M12 11v1" />
 </svg>;
}

/** Brand mark and wordmark. With `href` it links home (e.g. the landing page). */
export function BrandMark({ name = 'Tijori', href }: { name?: string; href?: string }) {
 const content = <><span className="tj-brand-mark"><TreasureChestIcon /></span><span>{name}</span></>;
 return href ? <a href={href} className="tj-tijori-brand" aria-label={`${name} home`}>{content}</a> : <span className="tj-tijori-brand">{content}</span>;
}
