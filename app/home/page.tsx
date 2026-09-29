import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { WhoStrip } from '@/components/landing/WhoStrip';
import { Benefits } from '@/components/landing/Benefits';
import { System } from '@/components/landing/System';
import { FoundingBand } from '@/components/landing/FoundingBand';
import { Pricing } from '@/components/landing/Pricing';
import { Faq } from '@/components/landing/Faq';
import { ClosingCta } from '@/components/landing/ClosingCta';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { SITE_URL } from '@/lib/seo';

// Public landing route for hosts mid-verification. Unlike /, it never redirects
// an authenticated visitor to the protected dashboard. Keep / canonical.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: SITE_URL },
};

export default function PublicHome() {
  return (
    <main>
      <LandingHeader />
      <Hero />
      <WhoStrip />
      <Benefits />
      <System />
      <FoundingBand />
      <Faq />
      <Pricing />
      <ClosingCta />
      <LandingFooter />
    </main>
  );
}
