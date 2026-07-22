import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { PostHogIdentify } from '@/components/PostHogIdentify';
import { outstandingReacceptances } from '@/lib/legal/acceptance';
import { verifyTrustedDeviceValue } from '@/lib/crypto';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/constants';
import { ReacceptanceGate } from './ReacceptanceGate';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();

  // 2FA gate: a host with 2FA enabled must clear the SMS challenge (trusted-device
  // cookie) before reaching the dashboard, even if they navigate here directly after
  // the password step.
  if (ctx.profile.two_factor_enabled && ctx.profile.phone_verified_at) {
    const trusted = verifyTrustedDeviceValue(ctx.user.id, cookies().get(TRUSTED_DEVICE_COOKIE)?.value);
    if (!trusted) redirect('/login/verify?next=/dashboard');
  }

  const supabase = createClient();
  const [{ count }, outstanding] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('host_account_id', ctx.account.id)
      .is('read_at', null),
    // Re-acceptance gate: which clickwrap docs has this host not accepted at the
    // current version? Resilient to a missing table (returns [] pre-migration).
    outstandingReacceptances(supabase, ctx.user.id),
  ]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <PostHogIdentify userId={ctx.user.id} email={ctx.profile.email} />
      {outstanding.length > 0 ? <ReacceptanceGate slugs={outstanding} /> : null}
      <DashboardNav unread={count ?? 0} />
      <main className="wrap" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>{children}</main>
    </div>
  );
}
