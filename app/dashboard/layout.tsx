import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { PostHogIdentify } from '@/components/PostHogIdentify';
import { outstandingReacceptances } from '@/lib/legal/acceptance';
import { ReacceptanceGate } from './ReacceptanceGate';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
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
