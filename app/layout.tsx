import type { Metadata, Viewport } from 'next';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@tijori/react/styles.css';
import './globals.css';
import InputMode from './components/InputMode';

export const metadata: Metadata = { title: 'Tijori — Good things, held together', description: 'A more human way to protect what you share.', icons: { icon: '/tijori-mark.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#f4f7fb', colorScheme: 'light' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><InputMode />{children}</body></html>; }
