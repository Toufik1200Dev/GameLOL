import type { Metadata, Viewport } from 'next';
import { Inter, Rajdhani } from 'next/font/google';
import './globals.css';
import { FirebaseAnalytics } from '../src/components/FirebaseAnalytics';

// Self-hosted via next/font (no layout shift, no external <link>). The CSS
// variables are consumed by the Tailwind theme in globals.css.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
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
