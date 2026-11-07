import { TijoriShell } from '../components/TijoriShell';
import { connection } from 'next/server';

// The Tijori app is a merchant of its own SDK: it installs @tijori/* from npm like any integrator.
// The integration is lib/tijori.ts, app/api/[...path]/route.ts, these routes and one stylesheet import.
export default async function TijoriLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 await connection();
 // Only this public contract address crosses the server/client boundary; no RPC credentials or keys.
 return <TijoriShell token={(process.env.TIJORI_REHEARSAL_TOKEN_ADDRESS ?? process.env.TICHORI_REHEARSAL_TOKEN_ADDRESS)?.trim() || undefined}>{children}</TijoriShell>;
}
