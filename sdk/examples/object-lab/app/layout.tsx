import type { Metadata } from 'next';
import '@tijori/react/styles.css';

export const metadata: Metadata = { title: 'Tijori object lab', description: 'Calibrate scanner v2 object matching.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="en"><body style={{ margin: 0, background: '#080c14' }}>{children}</body></html>;
}
