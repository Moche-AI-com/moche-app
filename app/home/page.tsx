import type { Metadata } from 'next';
import { getUser } from '@/lib/auth/guards';
import { switchAccountAction } from '@/app/(auth)/switch-account-action';
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

export default async function PublicHome() {
  const user = await getUser();
  return (
    <main>
      <LandingHeader />
      {user && (
        <section className="wrap" aria-label="Account options" style={{ paddingBlock: '1rem' }}>
          <p>You are signed in. If you are still being asked for a verification code, sign out before using another account or creating a new one.</p>
          <form action={switchAccountAction} style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" type="submit" name="destination" value="login">Use another account</button>
            <button className="btn btn-ghost" type="submit" name="destination" value="signup">Create a new account</button>
          </form>
        </section>
      )}
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
