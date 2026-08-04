import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/guards';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { Benefits } from '@/components/landing/Benefits';
import { DemoVideoSlot } from '@/components/landing/DemoVideoSlot';
import { Gallery } from '@/components/landing/Gallery';
import { CtaSection } from '@/components/landing/CtaSection';
import { Pricing } from '@/components/landing/Pricing';
import { LandingFooter } from '@/components/landing/LandingFooter';

// Page-level metadata overrides the root layout's title for this route only.
// The old landing.html title ("Moche-AI — An Intelligent Concierge for Every
// Home") violates the product's no-"AI"-in-headline rule; this replaces it.
export const metadata: Metadata = {
  title: 'Moche-AI — Run every property from one workspace',
  description:
    'Save hours every week, answer guest questions instantly, and never lose property knowledge again -- all from one guest operations workspace for short-term rentals.',
};

// This is the ONLY homepage now. middleware.ts no longer rewrites anonymous
// visitors to public/landing.html (that file stays on disk as an archive).
// Authenticated hosts still fall through here and get redirected to /dashboard.
export default async function Home() {
  const user = await getUser();
  if (user) redirect('/dashboard');

  return (
    <main>
      <LandingHeader />
      <Hero />
      <Benefits />
      <DemoVideoSlot />
      <Gallery />
      <CtaSection />
      <Pricing />
      <LandingFooter />
    </main>
  );
}
