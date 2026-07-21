import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/guards';
import { Logo } from '@/components/Logo';
import { PLANS, ACTIVATION_FEE_USD, ACTIVATION_FEE_ENABLED } from '@/lib/constants';

export default async function Home() {
  const user = await getUser();
  if (user) redirect('/dashboard');

  return (
    <main>
      <header className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72 }}>
        <Logo />
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </header>
      <section className="wrap" style={{ paddingTop: 'clamp(3rem,8vw,7rem)', paddingBottom: '4rem', maxWidth: 820 }}>
        <span className="badge badge-teal" style={{ marginBottom: '1.25rem' }}>Property Brain · Guest Concierge</span>
        <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4.5rem)', marginBottom: '1.25rem' }}>
          Your property&apos;s <span className="gradient-text">brain</span>.<br />Your guests&apos; first stop.
        </h1>
        <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 560, marginBottom: '2rem' }}>
          Each property gets an AI concierge trained on your own documents. Guests scan a QR code, ask in any
          language, and get instant, grounded answers — no app, no login, no PMS.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn btn-primary btn-lg">Create your host account</Link>
          <Link href="/login" className="btn btn-ghost btn-lg">Sign in</Link>
        </div>
      </section>

      <section id="pricing" className="wrap" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <div style={{ marginBottom: '1.75rem', maxWidth: 560 }}>
          <span className="badge badge-teal" style={{ marginBottom: '1rem' }}>Pricing</span>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', marginBottom: '.5rem' }}>
            Simple plans that scale with your properties
          </h2>
          <p className="muted" style={{ fontSize: '1.05rem' }}>
            Every plan includes the AI concierge, Property Brain, and guest verification.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1rem' }}>
          {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
            const plan = PLANS[id];
            const featured = id === 'pro';
            return (
              <div
                key={id}
                className="card"
                style={{
                  padding: '1.5rem 1.35rem',
                  border: featured ? '1px solid var(--teal)' : undefined,
                  position: 'relative',
                }}
              >
                {featured ? (
                  <span className="badge badge-teal" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>Most popular</span>
                ) : null}
                <h3 style={{ fontSize: '1.15rem', marginBottom: '.15rem' }}>{plan.name}</h3>
                <p style={{ margin: '0 0 .1rem' }}>
                  <strong style={{ fontSize: '1.9rem' }}>${plan.monthly}</strong>
                  <span className="muted" style={{ fontSize: '.85rem' }}>/mo</span>
                </p>
                <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 1rem' }}>
                  or ${plan.annual}/yr &middot; up to {plan.propertyLimit} propert{plan.propertyLimit === 1 ? 'y' : 'ies'}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {plan.features.map((f) => (
                    <li key={f} className="muted" style={{ fontSize: '.85rem', display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--teal)' }}>&#10003;</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className={`btn btn-sm ${featured ? 'btn-primary' : 'btn-ghost'}`} style={{ width: '100%' }}>
                  Get started
                </Link>
              </div>
            );
          })}
        </div>

        <p className="faint" style={{ fontSize: '.78rem', marginTop: '1.25rem' }}>
          {ACTIVATION_FEE_ENABLED
            ? `A one-time $${ACTIVATION_FEE_USD} activation fee covers onboarding and initial Property Brain setup. Prices in USD.`
            : 'No setup fees \u2014 cancel anytime. Annual plans include two months free. Prices in USD.'}
        </p>
      </section>

      <footer className="wrap" style={{ paddingBottom: '2.5rem', fontSize: '.75rem', opacity: 0.45 }}>
        Built in Somerville, MA
      </footer>
    </main>
  );
}
