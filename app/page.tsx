import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/guards';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { Benefits } from '@/components/landing/Benefits';
import { FoundingBand } from '@/components/landing/FoundingBand';
import { Pricing } from '@/components/landing/Pricing';
import { Faq } from '@/components/landing/Faq';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/seo';

// Page-level metadata overrides the root layout for this route only.
// The old landing.html title ("Moche-AI — An Intelligent Concierge for Every
// Home") violates the product's no-"AI"-in-headline rule; this replaces it.
//
// `robots` is the important line. The root layout defaults every route to
// noindex/nofollow to protect /dashboard and the per-guest /stay and /answer
// URLs. The landing page inherited that default, so the live marketing site was
// serving `noindex, nofollow` and could not be indexed at all. This opts the one
// page that must rank back in, without weakening the default for anything else.
export const metadata: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: { canonical: SITE_URL },
  // siteName and locale are repeated from the root layout on purpose: Next
  // replaces the `openGraph` object wholesale rather than deep-merging it, so
  // omitting them here drops og:site_name and og:locale from the one page that
  // actually gets shared.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

// This is the ONLY homepage. middleware.ts no longer rewrites anonymous
// visitors to public/landing.html (that file stays on disk as an archive).
// Authenticated hosts still fall through here and get redirected to /dashboard.
//
// Section order is deliberately short: hero, why, offer, price, objections.
// The standalone gallery section was folded into the hero and the "demo video
// coming soon" placeholder was removed -- an empty state on a marketing page
// costs more trust than the section earns.
export default async function Home() {
  const user = await getUser();
  if (user) redirect('/dashboard');

  return (
    <main>
      <LandingHeader />
      <Hero />
      <Benefits />
      <FoundingBand />
      <Pricing />
      <Faq />
      <LandingFooter />
    </main>
  );
}
