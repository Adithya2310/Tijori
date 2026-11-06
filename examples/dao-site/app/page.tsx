'use client';
import { TijoriApp, TijoriProvider } from '@tijori/react';

// The whole integration: one provider pointed at this site's own Tijori backend, and the drop-in app.
export default function Treasury() {
 return <TijoriProvider baseUrl="/api/tijori/v1" assetBaseUrl="/tijori-assets/" theme={{ accent: '#7c5cff' }}>
  <TijoriApp name="Builders DAO" footer={<><span /><span>Builders DAO treasury · powered by Tijori</span><span>DEMO ONLY · TEST TOKENS</span></>} />
 </TijoriProvider>;
}
