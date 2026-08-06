import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { markAllNotificationsReadFormAction } from './actions';

export const dynamic = 'force-dynamic';

const KIND_BADGE: Record<string, string> = {
  escalation: 'badge-coral',
  service_request: 'badge-coral',
  system: '',
};

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function NotificationsPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const { data: items } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link, read_at, created_at')
    .eq('host_account_id', ctx.account.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const list = items ?? [];
  const unreadCount = list.filter((n) => !n.read_at).length;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Notifications</h1>
          <p className="muted" style={{ fontSize: '.9rem' }}>Escalations, service requests, and account activity.</p>
        </div>
        {unreadCount > 0 && (
          <form action={markAllNotificationsReadFormAction}>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
              <CheckCheck size={15} aria-hidden /> Mark all as read ({unreadCount})
            </button>
          </form>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">You&rsquo;re all caught up. New guest escalations and service requests will show up here.</p>
        </div>
      ) : (
        <div className="notifications-history-list">
          {list.map((n) => {
            const inner = (
              <div
                className="card notification-history-row"
                style={{
                  borderLeft: n.read_at ? '3px solid transparent' : '3px solid var(--teal)',
                }}
              >
                <div className="notification-history-content">
                  <div className="notification-history-head">
                    <strong className="notification-history-title">{n.title}</strong>
                    <span className={`badge ${KIND_BADGE[n.kind] ?? ''}`} style={{ flexShrink: 0 }}>{n.kind}</span>
                  </div>
                  {n.body ? <p className="muted notification-history-body">{n.body}</p> : null}
                </div>
                <span className="faint notification-history-time">{timeAgo(n.created_at)}</span>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} style={{ display: 'block' }}>{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
