import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireLaunchAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { Breadcrumbs } from '@/components/dashboard/Breadcrumbs';
import { PostHogIdentify } from '@/components/PostHogIdentify';
import { outstandingReacceptances } from '@/lib/legal/acceptance';
import { verifyTrustedDeviceValue } from '@/lib/crypto';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/constants';
import { ReacceptanceGate } from './ReacceptanceGate';
import { FeedbackControl } from './FeedbackControl';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Launch gate: pre-launch accounts created after the cutoff (including invitees) are
  // held on /welcome. Founders and existing testers pass through. See requireLaunchAccess.
  const ctx = await requireLaunchAccess();

  // 2FA gate: a host with 2FA enabled must clear the SMS challenge (trusted-device
  // cookie) before reaching the dashboard, even if they navigate here directly after
  // the password step.
  if (ctx.profile.two_factor_enabled && ctx.profile.phone_verified_at) {
    const trusted = verifyTrustedDeviceValue(ctx.user.id, (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value);
    if (!trusted) redirect('/login/verify?next=/dashboard');
  }

  const supabase = createClient();
  const [{ count }, { data: recentNotifications }, outstanding, { data: propertyRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('host_account_id', ctx.account.id)
      .is('read_at', null),
    // Feeds the notification bell dropdown — most recent items across all kinds,
    // read or not, so a host can see what they already cleared too.
    supabase
      .from('notifications')
      .select('id, kind, title, body, link, read_at, created_at')
      .eq('host_account_id', ctx.account.id)
      .order('created_at', { ascending: false })
      .limit(8),
    // Re-acceptance gate: which clickwrap docs has this host not accepted at the
    // current version? Resilient to a missing table (returns [] pre-migration).
    outstandingReacceptances(supabase, ctx.user.id),
    // Breadcrumb labels: a property id in the path has to render as a place the
    // host recognises. One small RLS-scoped read here covers every property-scoped
    // route, which is cheaper than a per-route layout fetch. Plans cap at 100
    // properties, so this list stays small.
    supabase.from('properties').select('id, display_name').order('display_name').limit(200),
  ]);

  const propertyNames: Record<string, string> = {};
  for (const row of propertyRows ?? []) {
    if (row.display_name) propertyNames[row.id] = row.display_name;
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <PostHogIdentify userId={ctx.user.id} email={ctx.profile.email} />
      {outstanding.length > 0 ? <ReacceptanceGate slugs={outstanding} /> : null}
      <DashboardNav
        unread={count ?? 0}
        notifications={recentNotifications ?? []}
        isOwner={ctx.account.owner_id === ctx.user.id}
      />
      <main className="wrap" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Breadcrumbs names={propertyNames} />
        {children}
      </main>
      <FeedbackControl />
    </div>
  );
}
