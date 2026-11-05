import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Tichori', description: 'A more human way to protect what you share.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
