import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/seo';

export const metadata: Metadata = {
  // Required for the file-convention OG image and any `alternates.canonical` to
  // resolve to absolute URLs. Without it Next emits a relative og:image, which
  // most social scrapers drop.
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,

  // noindex stays the DEFAULT on purpose. Everything under this layout is
  // either auth-gated (/dashboard), a per-guest URL that must never be indexed
  // (/stay, /g, /answer), or a thin auth page. The two surfaces that SHOULD be
  // indexed opt in explicitly: app/page.tsx and app/legal/layout.tsx.
  //
  // This inverted default is why the landing page shipped invisible to search:
  // it inherited noindex and never overrode it. Keep the default, keep the
  // override — do not flip this to index:true to "fix" a single page.
  robots: { index: false, follow: false },

  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Blocking boot script. Two jobs, both of which must happen before first paint
// or in the very first tick, which is why this is an inline string rather than a
// component effect.
//
// 1. Theme. Applies the visitor's stored choice, otherwise the server-rendered
//    default (light) paints first and <ThemeToggle> only corrects it in an
//    effect, giving returning dark-mode users a white flash.
//
// 2. Reveal safety. Every landing section is wrapped in <Reveal>, which serves
//    at opacity 0 and relies on client JS to show it. Setting data-js='on' here
//    lets CSS distinguish "JS available" from "no JS", and the timer below
//    catches the case where JS ran but React never hydrated -- without it, a
//    failed hydration leaves the entire page blank below the header. 2.5s is
//    comfortably past hydration on a slow connection, so a healthy load never
//    trips it. See the reveal failsafe block in app/globals.css.
//
// Wrapped in try/catch because localStorage throws in some privacy modes, and
// the reveal guard must still run if the theme read fails.
const BOOT = `var d=document.documentElement;d.setAttribute('data-js','on');try{var t=localStorage.getItem('moche-theme');if(t==='dark'||t==='light'){d.setAttribute('data-theme',t)}}catch(e){}setTimeout(function(){if(!d.hasAttribute('data-hydrated')){d.setAttribute('data-reveal-failsafe','on')}},2500);`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
