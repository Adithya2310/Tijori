import type { Metadata } from 'next';
import '@tijori/react/styles.css';

export const metadata: Metadata = { title: 'Builders DAO · Treasury', description: 'Example DAO site using the Tijori SDK.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="en"><body style={{ margin: 0, background: '#080c14' }}>{children}</body></html>;
}
