import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Moche-AI — Your Property Brain',
  description:
    'The in-stay AI guest concierge for short-term rental hosts. Each property gets a Property Brain that answers guest questions instantly.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Applies the visitor's stored theme before first paint. Without this the
// server renders the default (light) and <ThemeToggle> only switches to dark
// in an effect, which makes returning dark-mode users see a white flash.
// Kept as a tiny inline string so it blocks for microseconds, and wrapped in
// try/catch because localStorage throws in some privacy modes.
const THEME_BOOT = `try{var t=localStorage.getItem('moche-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
