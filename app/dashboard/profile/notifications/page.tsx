import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories';
import { NotificationPreferencesForm, type CategoryPreference } from './NotificationPreferencesForm';

export const dynamic = 'force-dynamic';

/**
 * Two questions answered on one page:
 *  1. "Which notification paths can reach me?" — the per-category switches.
 *     Host messages, billing, and security alerts stay always on; everything
 *     else is the member's choice.
 *  2. "If something urgent happens, does it reach me?" — the channel panel
 *     (email / text / in-app), this page's original job, kept intact below.
 *
 * The notification feed itself stays at /dashboard/notifications, where the
 * bell points. Duplicating the feed here would give the same list two homes
 * and two unread counts.
 */
export default async function ProfileNotificationsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const [{ count: unread }, { data: prefRows, error: prefError }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('host_account_id', ctx.account.id)
      .is('read_at', null),
    supabase
      .from('notification_preferences')
      .select('category, enabled')
      .eq('profile_id', ctx.user.id),
  ]);

  // A missing row means "subscribed" — defaults stay on until a member opts
  // out, so new members and brand-new categories never silently stop notifying.
  // A failed read (e.g. the preferences migration has not run yet) fails open
  // to the same all-on defaults rather than showing everything as off.
  const saved = new Map<string, boolean>(
    (prefError ? [] : prefRows ?? []).map((r) => [r.category, r.enabled]),
  );
  const categories: CategoryPreference[] = NOTIFICATION_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    alwaysOn: c.alwaysOn,
    enabled: c.alwaysOn ? true : saved.get(c.key) ?? true,
  }));

  const phone = ctx.profile.phone;
  const phoneVerified = !!ctx.profile.phone_verified_at;
  const smsOptIn = !!ctx.profile.sms_opt_in;

  const rows: Array<{ channel: string; state: string; ok: boolean; note: string }> = [
    {
      channel: 'Email',
      state: ctx.profile.email,
      ok: true,
      note: 'Always on. Escalations, billing, and account security go here.',
    },
    {
      channel: 'Text message',
      state: !phone
        ? 'No phone number yet'
        : !phoneVerified
          ? 'Added but not verified'
          : smsOptIn
            ? `On for ${phone}`
            : `Verified, but turned off for ${phone}`,
      ok: !!phone && phoneVerified && smsOptIn,
      note: 'Used only for urgent guest escalations, never marketing.',
    },
    {
      channel: 'In-app',
      state: unread ? `${unread} unread` : 'Nothing unread',
      ok: true,
      note: 'The bell in the header, and your full history.',
    },
  ];

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Notifications</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 560 }}>
        Choose the notification paths that can reach you, and check that your channels are live.
        Nothing here is marketing.
      </p>

      <div className="card" style={{ padding: '1.25rem', maxWidth: 620, marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '.95rem', marginTop: 0, marginBottom: '.25rem' }}>Notification paths</h3>
        <p className="faint" style={{ fontSize: '.8rem', marginTop: 0, marginBottom: '1rem' }}>
          Turned-off paths still land in your notification history — they just stop pinging your
          bell and inbox.
        </p>
        <NotificationPreferencesForm categories={categories} />
      </div>

      <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
        <h3 style={{ fontSize: '.95rem', marginTop: 0, marginBottom: '1rem' }}>Channels</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
          {rows.map((r) => (
            <li key={r.channel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '.95rem' }}>{r.channel}</strong>
                <span className={r.ok ? 'badge badge-teal' : 'badge badge-coral'} style={{ fontSize: '.7rem' }}>
                  {r.ok ? 'Reachable' : 'Not reaching you'}
                </span>
              </div>
              <p style={{ margin: '.2rem 0 0', fontSize: '.88rem' }}>{r.state}</p>
              <p className="faint" style={{ margin: '.15rem 0 0', fontSize: '.78rem' }}>{r.note}</p>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          <Link href="/dashboard/profile/security" className="btn btn-sm">
            Manage phone and texts
          </Link>
          <Link href="/dashboard/notifications" className="btn btn-sm btn-ghost">
            View notification history
          </Link>
        </div>
      </div>
    </section>
  );
}
