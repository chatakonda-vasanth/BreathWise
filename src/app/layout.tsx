import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { Inter, Noto_Sans_Devanagari, Noto_Sans_Telugu } from 'next/font/google';
import './globals.css';

/**
 * Fonts are self-hosted at build time by next/font: no request ever goes to a
 * third-party font CDN, which keeps `font-src 'self'` in the CSP.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-devanagari',
  display: 'swap',
  weight: ['400', '600', '700'],
});

const telugu = Noto_Sans_Telugu({
  subsets: ['telugu', 'latin'],
  variable: '--font-telugu',
  display: 'swap',
  weight: ['400', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Urban Air Quality Assistant — smog-day guidance for families',
  description:
    'GenAI guidance for smog days: air quality, low-emission daily routines, indoor air hacks and sustainable alternatives tailored to your location and lifestyle.',
  applicationName: 'Urban Air Quality Assistant',
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#070d18' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires dynamic rendering (documented tradeoff).
  await connection();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${devanagari.variable} ${telugu.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
