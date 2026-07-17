import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { PostHogIdentify } from '@/components/PostHogIdentify';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const supabase = createClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('host_account_id', ctx.account.id)
    .is('read_at', null);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <PostHogIdentify userId={ctx.user.id} fullName={ctx.profile.full_name ?? null} />
      <DashboardNav unread={count ?? 0} />
      <main className="wrap" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>{children}</main>
    </div>
  );
}
