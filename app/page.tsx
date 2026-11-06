'use client';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { TijoriApp, TijoriProvider } from '@tijori/react';
import PhoneAccess from './components/PhoneAccess';
import { LegacyPassphraseLogin, LegacyVault, PendingSafeResume } from './legacy';

// The reference app is the drop-in <TijoriApp/> plus app-only extras: LAN phone testing, the Anon RPC diagnostic
// and legacy demo features (passphrase identities, Base Sepolia Safes and simulated transfers).
export default function Home() {
 return <TijoriProvider baseUrl="/api/v1" assetBaseUrl="/tijori-assets/">
  <TijoriApp
   authAlternative={{ label: 'Use existing passphrase identity', render: () => <LegacyPassphraseLogin /> }}
   authFooter={<>TIJORI &nbsp; · &nbsp; BUILT FOR TOGETHER &nbsp; · &nbsp; <Link href="/diagnostics/anon-rpc">Anon RPC diagnostic</Link></>}
   renderVault={vault => <LegacyVault vault={vault} />}
   dashboardExtras={<><PendingSafeResume /><PhoneAccess /></>}
   footer={<><Link href="/diagnostics/anon-rpc">Anon RPC diagnostic</Link><span><ShieldCheck size={15} /> Made for trust, built for together.</span><span>TIJORI &nbsp; © 2026</span></>}
  />
 </TijoriProvider>;
}
