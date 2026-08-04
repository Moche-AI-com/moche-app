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

// Page-level metadata overrides the root layout's title for this route only.
// The old landing.html title ("Moche-AI — An Intelligent Concierge for Every
// Home") violates the product's no-"AI"-in-headline rule; this replaces it.
export const metadata: Metadata = {
  title: 'Moche-AI — Run every property from one workspace',
  description:
    'Save hours every week, answer guest questions instantly, and never lose property knowledge again -- all from one guest operations workspace for short-term rentals.',
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
