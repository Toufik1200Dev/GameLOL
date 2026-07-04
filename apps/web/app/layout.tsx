import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { FirebaseAnalytics } from '../src/components/FirebaseAnalytics';

// Fonts are self-hosted from ./fonts (committed woff2) via next/font/local, so
// the production build never fetches Google Fonts at build time (avoids flaky-
// network ECONNRESET failures). The CSS variables are consumed by the Tailwind
// theme in globals.css. Inter ships as a single variable file (100–900).
const inter = localFont({
  src: [{ path: './fonts/inter.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-inter',
  display: 'swap',
});

const rajdhani = localFont({
  src: [
    { path: './fonts/rajdhani-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/rajdhani-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/rajdhani-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-rajdhani',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GameOnline — Private Lobby Shooter',
  description: 'A private-lobby multiplayer 3D browser shooter.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0e1a',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${rajdhani.variable}`}>
      <body>
        <main>{children}</main>
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
