import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { NOTIFICATION_CATEGORIES, categorySupportsChannel } from '@/lib/notifications/categories';
import { NotificationPreferencesForm, type CategoryPreference } from './NotificationPreferencesForm';
import { DigestSwitch } from './DigestSwitch';
import { PropertyMutes } from './PropertyMutes';

export const dynamic = 'force-dynamic';

/**
 * Three questions answered on one page:
 *  1. "Which notification paths can reach me, and on which channel?" — the
 *     category × channel matrix, plus the daily-digest switch.
 *  2. "Can I quiet one property without touching the rest?" — per-property
 *     mutes.
 *  3. "If something urgent happens, does it reach me?" — the channel panel
 *     (email / text / in-app), this page's original job, kept intact below.
 *
 * Host messages, billing, and security alerts stay always on everywhere;
 * everything else is the member's choice. The notification feed itself stays
 * at /dashboard/notifications, where the bell points.
 */
export default async function ProfileNotificationsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const [
    { count: unread },
    { data: prefRows, error: prefError },
    { data: digestRow, error: digestError },
    { data: propertyRows },
    { data: muteRows, error: muteError },
  ] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('host_account_id', ctx.account.id)
      .is('read_at', null),
    supabase
      .from('notification_preferences')
      .select('category, enabled, email_enabled, sms_enabled')
      .eq('profile_id', ctx.user.id),
    // The digest switch lives on profiles, read directly here so the page never
    // depends on which columns the session guard happens to select.
    supabase
      .from('profiles')
      .select('email_digest_enabled')
      .eq('id', ctx.user.id)
      .maybeSingle(),
    // Per-property mutes target properties on this account (RLS-scoped: members
    // see the properties they can access).
    supabase
      .from('properties')
      .select('id, display_name')
      .eq('host_account_id', ctx.account.id)
      .order('display_name'),
    supabase
      .from('notification_property_mutes')
      .select('id, property_id, category')
      .eq('profile_id', ctx.user.id),
  ]);

  // A missing row means "subscribed with default channels" — in-app + email on,
  // text off. A failed read (e.g. a preferences migration has not run yet)
  // fails open to the same defaults rather than showing everything as off.
  const saved = new Map<string, { enabled: boolean; email: boolean; sms: boolean }>(
    (prefError ? [] : prefRows ?? []).map((r) => [
      r.category,
      { enabled: r.enabled, email: r.email_enabled ?? true, sms: r.sms_enabled ?? false },
    ]),
  );
  const categories: CategoryPreference[] = NOTIFICATION_CATEGORIES.map((c) => {
    const row = saved.get(c.key);
    return {
      key: c.key,
      label: c.label,
      description: c.description,
      alwaysOn: c.alwaysOn,
      enabled: c.alwaysOn ? true : row?.enabled ?? true,
      emailEnabled: c.alwaysOn ? true : row?.email ?? true,
      smsEnabled: c.alwaysOn ? true : row?.sms ?? false,
      emailCapable: categorySupportsChannel(c.key, 'email'),
      smsCapable: categorySupportsChannel(c.key, 'sms'),
    };
  });

  const digestEnabled = digestError ? false : (digestRow as { email_digest_enabled?: boolean } | null)?.email_digest_enabled ?? false;

  const properties = (propertyRows ?? [])
    .filter((p) => p.display_name)
    .map((p) => ({ id: p.id, name: p.display_name as string }));
  const mutes = (muteError ? [] : muteRows ?? []).map((m) => ({
    id: m.id,
    propertyId: m.property_id,
    categoryKey: m.category,
  }));
  const muteableCategories = NOTIFICATION_CATEGORIES.filter((c) => !c.alwaysOn).map((c) => ({
    key: c.key,
    label: c.label,
  }));

  const phone = ctx.profile.phone;
  const phoneVerified = !!ctx.profile.phone_verified_at;
  const smsOptIn = !!ctx.profile.sms_opt_in;
  const smsReady = phoneVerified && smsOptIn;

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
          For each path, choose where it reaches you. Turning a path off entirely still lands it in
          your notification history — it just stops pinging your bell and inbox.
        </p>
        <DigestSwitch enabled={digestEnabled} />
        <NotificationPreferencesForm categories={categories} smsReady={smsReady} />
      </div>

      <div className="card" style={{ padding: '1.25rem', maxWidth: 620, marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '.95rem', marginTop: 0, marginBottom: '.25rem' }}>Per-property mutes</h3>
        <p className="faint" style={{ fontSize: '.8rem', marginTop: 0, marginBottom: '1rem' }}>
          Quiet one path at one property without touching the account-wide switches — useful when
          one place gets busy and the others still need you.
        </p>
        <PropertyMutes properties={properties} mutes={mutes} categories={muteableCategories} />
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
