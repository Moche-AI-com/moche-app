import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { PLANS } from '@/lib/constants';
import { parsePricingIntent } from '@/lib/billing/pricing-intent';

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: { plan?: string; interval?: string };
}) {
  const intent = parsePricingIntent(searchParams?.plan, searchParams?.interval);
  const loginHref = intent
    ? `/login?next=${encodeURIComponent('/dashboard/profile/billing')}`
    : '/login';
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Logo />
        </div>
        <div className="card" style={{ padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>Check your inbox</h1>
          <p className="muted" style={{ marginBottom: intent ? '.75rem' : '1.5rem' }}>
            We sent you a verification link. Click it to activate your account, then sign in.
          </p>
          {intent ? (
            <p className="muted" style={{ margin: '0 0 1.5rem', fontSize: '.88rem', lineHeight: 1.5 }}>
              Your {PLANS[intent.planId].name} ({intent.interval}) preference is saved to your account.
              After verification, review the current price in Billing before starting any paid plan.
            </p>
          ) : null}
          <Link href={loginHref} className="btn btn-primary">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
