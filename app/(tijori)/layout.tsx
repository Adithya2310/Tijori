import { TijoriShell } from '../components/TijoriShell';

// The Tijori app is a merchant of its own SDK: it installs @tijori/* from npm like any integrator.
// The integration is lib/tijori.ts, app/api/[...path]/route.ts, these routes and one stylesheet import.
export default function TijoriLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <TijoriShell>{children}</TijoriShell>;
}
