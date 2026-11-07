'use client';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { TijoriApp, useIdentity, type TijoriAppProps } from '@tijori/react';
import PhoneAccess from './PhoneAccess';
import AuthAtmosphere from './AuthAtmosphere';
import { PrivateVaultProvider, PrivateVaultStatus } from './PrivateVaultReads';

// The guided journey props arrived in @tijori/react 0.2.0; the published 0.1.0 (used by CI until 0.2.0 is
// released) accepts and ignores them.
type JourneyProps = { authMode?: 'signup' | 'login'; authBackdrop?: ReactNode; homeHref?: string };
const App: ComponentType<TijoriAppProps & JourneyProps> = TijoriApp;

/** After signing up or logging in on /signup or /login, continue in the app at /app. */
function ContinueToApp() {
 const { signedIn } = useIdentity();
 const router = useRouter(), path = usePathname();
 useEffect(() => { if (signedIn && path !== '/app') router.replace('/app'); }, [signedIn, path, router]);
 return null;
}

/** One provider for /signup, /login and /app, so moving between them keeps the session and loaded state. */
export function TijoriShell({ children, token }: { children: ReactNode; token?: string }) {
 return <PrivateVaultProvider token={token}><ContinueToApp />{children}</PrivateVaultProvider>;
}

export function TijoriScreen({ mode }: { mode?: 'signup' | 'login' }) {
 return <App authMode={mode} authBackdrop={<AuthAtmosphere />} homeHref="/"
  dashboardExtras={<PhoneAccess />}
  vaultExtras={vault => vault.safe?.chainId === 1874 ? <PrivateVaultStatus key={vault.id} vaultId={vault.id} /> : null}
  footer={<><span /><span><ShieldCheck size={15} /> Made for trust, built for together.</span><span><a href="https://www.npmjs.com/org/tijori" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Built with the Tijori SDK ↗</a></span></>} />;
}
