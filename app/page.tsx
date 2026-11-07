'use client';
import { ShieldCheck } from 'lucide-react';
import { TijoriApp, TijoriProvider } from '@tijori/react';
import PhoneAccess from './components/PhoneAccess';

// The Tijori app is a merchant of its own SDK: it installs @tijori/* from npm like any integrator.
// The whole integration is lib/tijori.ts, app/api/[...path]/route.ts, this page and one stylesheet import.
// The one demo flow: object sign-up/login, a Whitechain vault with registered members, and payouts that run once
// every member's device hears the payment code. PhoneAccess (LAN phone testing) is the only app-specific addition.
export default function Home() {
 return <TijoriProvider baseUrl="/api/v1" assetBaseUrl="/tijori-assets/">
  <TijoriApp
   dashboardExtras={<PhoneAccess />}
   footer={<><span /><span><ShieldCheck size={15} /> Made for trust, built for together.</span><span><a href="https://www.npmjs.com/org/tijori" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Built with the Tijori SDK ↗</a></span></>}
  />
 </TijoriProvider>;
}
