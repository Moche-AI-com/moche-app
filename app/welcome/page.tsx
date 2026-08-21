import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionContext, LAUNCH_GATE_CUTOFF_ISO } from '@/lib/auth/guards';
import { Logo } from '@/components/Logo';
import { EarlyAccessForm } from './EarlyAccessForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'You are on the list — Moche-AI',
  description:
    'Thanks for confirming your email. Moche-AI launches January 1, 2027 — we will email you the moment your workspace is live.',
  robots: { index: false, follow: false },
};

// Pre-launch holding page. New accounts land here after confirming their email
// (the signup confirmation link carries next=/welcome), and requireLaunchAccess
// redirects any gated account that tries to reach /dashboard. Existing testers and
// founders are never sent here — the gate only fires for accounts created after
// LAUNCH_GATE_CUTOFF_ISO.
export default async function WelcomePage() {
  const ctx = await getSessionContext();

  // If a founder or a pre-cutoff tester somehow lands here, send them to the tool.
  if (ctx) {
    const isNewUser = new Date(ctx.profile.created_at) >= new Date(LAUNCH_GATE_CUTOFF_ISO);
    if (ctx.isFounder || !isNewUser) redirect('/dashboard');
  }

  const firstName = ctx?.profile.full_name?.trim().split(/\s+/)[0] ?? null;
  const email = ctx?.profile.email ?? null;

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg, #070c14)',
        color: 'var(--text, #eaf1fa)',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1rem',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
          <Logo variant="gradient" size={40} />
        </div>

        <div
          style={{
            background: 'var(--surface, #0e1826)',
            border: '1px solid rgba(157,176,198,0.14)',
            borderRadius: 16,
            padding: '2rem 1.75rem',
          }}
        >
          <p
            style={{
              margin: '0 0 .5rem',
              fontSize: '.8rem',
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--teal, #33e6d4)',
            }}
          >
            Early access
          </p>
          <h1 style={{ margin: '0 0 .75rem', fontSize: '1.7rem', lineHeight: 1.25 }}>
            {firstName ? `Thanks for confirming, ${firstName}.` : 'Thanks for confirming your email.'}
          </h1>
          <p style={{ margin: '0 0 1rem', fontSize: '.98rem', lineHeight: 1.6, color: 'var(--text-muted, #9db0c6)' }}>
            We are putting the finishing touches on Moche-AI and we go live on{' '}
            <strong style={{ color: 'inherit' }}>January&nbsp;1,&nbsp;2027</strong>. Your account is
            confirmed and your spot is held — we will email you the moment your workspace is ready.
          </p>
          <p style={{ margin: '0 0 1.5rem', fontSize: '.9rem', lineHeight: 1.6, color: 'var(--text-faint, #5f7793)' }}>
            You will not be charged anything before launch. Pricing is public on our homepage and
            early hosts lock in founding rates.
          </p>

          <div
            style={{
              borderTop: '1px solid rgba(157,176,198,0.12)',
              paddingTop: '1.5rem',
            }}
          >
            <h2 style={{ margin: '0 0 .25rem', fontSize: '1.05rem' }}>
              While you wait — tell us about your setup
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '.85rem', color: 'var(--text-faint, #5f7793)' }}>
              Optional, two minutes. It helps us prioritize what to finish first and gets your
              workspace pre-loaded for day one.
            </p>
            <EarlyAccessForm defaultEmail={email} defaultName={ctx?.profile.full_name ?? ''} userId={ctx?.user.id ?? null} />
          </div>
        </div>

        <p style={{ margin: '1.25rem 0 0', textAlign: 'center', fontSize: '.78rem', color: 'var(--text-faint, #5f7793)' }}>
          Moche-AI · Built in Somerville, MA
        </p>
      </div>
    </main>
  );
}
