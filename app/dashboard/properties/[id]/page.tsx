import Link from 'next/link';
import { headers } from 'next/headers';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarCheck,
  CalendarDays,
  Check,
  LifeBuoy,
  MapPin,
  QrCode,
  Settings,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBrainHealth, gapPrompts } from '@/lib/brain/health';
import { ListingImportKickoff } from './ListingImportKickoff';
import { CopyPortalLink } from './CopyPortalLink';

export const dynamic = 'force-dynamic';

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { import?: string };
}) {
  const access = await requirePropertyAccess((await params).id);
  const { property, can } = access;
  const supabase = createClient();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: items },
    { count: stayCount },
    { count: openEsc },
    { count: curatedCount },
    { count: discoveredCount },
    { count: openExtras },
    { data: inboxRows },
    { count: openService },
    { count: arrivalsWeek },
  ] = await Promise.all([
    supabase.from('brain_items').select('category, status, deleted_at, visibility').eq('property_id', property.id),
    supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', property.id).is('deleted_at', null),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('status', 'open'),
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('approved', true).eq('hidden', false).is('deleted_at', null),
    supabase.from('nearby_places').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('hidden', false),
    supabase.from('extras_orders').select('id', { count: 'exact', head: true }).eq('property_id', property.id).not('fulfillment_status', 'in', '("fulfilled","declined","canceled","expired","refunded")'),
    // The Inbox card previews the newest few open escalations; stay_id and
    // conversation_id feed the sender/party join below and the thread link.
    supabase.from('escalations').select('id, question, created_at, stay_id, conversation_id').eq('property_id', property.id).eq('status', 'open').order('created_at', { ascending: false }).limit(3),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('property_id', property.id).in('status', ['new', 'acknowledged', 'in_progress']),
    supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', property.id).is('deleted_at', null).eq('lifecycle_status', 'active').gte('check_in', today).lte('check_in', nextWeek),
  ]);

  const health = computeBrainHealth(items ?? []);
  const prompts = gapPrompts(health);
  // Upper bound, not the merged total: dedupe happens at read time in lib/local/merge.
  const localCount = (curatedCount ?? 0) + (discoveredCount ?? 0);

  // Only an https listing link is ever handed to the client importer; anything
  // else in the query string is ignored outright.
  const rawImport = typeof searchParams.import === 'string' ? searchParams.import.trim() : '';
  const listingImportUrl = /^https?:\/\//i.test(rawImport) && rawImport.length <= 2000 ? rawImport : null;

  // The stable portal URL is safe to show and copy: guests still verify with the
  // contact on their booking before anything about a stay is revealed.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const portalUrl = host ? `${proto}://${host}/g/${property.slug}` : null;

  const base = `/dashboard/properties/${property.id}`;
  const needsAttention = (openEsc ?? 0) + health.gaps.length;
  const inbox = inboxRows ?? [];

  // Sender + party labels for the Inbox rows. The host is already authorized by
  // requirePropertyAccess above; the join path mirrors the guest-chats API,
  // which reads the same tables through the service role.
  const escStayIds = [...new Set(inbox.map((esc) => esc.stay_id).filter((v): v is string => Boolean(v)))];
  const escConvoIds = [...new Set(inbox.map((esc) => esc.conversation_id).filter((v): v is string => Boolean(v)))];
  const admin = createAdminClient();
  const db = admin as any;
  const [{ data: escStays }, { data: escConvos }] = await Promise.all([
    escStayIds.length ? supabase.from('stays').select('id, guest_display_name').in('id', escStayIds) : Promise.resolve({ data: [] }),
    escConvoIds.length ? db.from('conversations').select('id, guest_identity_id').in('id', escConvoIds) : Promise.resolve({ data: [] }),
  ]);
  const identityIds = [...new Set(((escConvos ?? []) as any[]).map((c) => c.guest_identity_id).filter(Boolean))];
  const { data: escIdentities } = identityIds.length
    ? await db.from('guest_identities').select('id, first_name, display_name').in('id', identityIds)
    : { data: [] };
  const partyByStayId = new Map<string, string>((escStays ?? []).map((s) => [s.id, s.guest_display_name]));
  const identityByConvoId = new Map<string, string | null>(((escConvos ?? []) as any[]).map((c) => [c.id, c.guest_identity_id]));
  const nameByIdentityId = new Map<string, string>(((escIdentities ?? []) as any[]).map((g) => [g.id, g.first_name || g.display_name]));

  return (
    <div>
      {listingImportUrl && can.editBrain && (
        <ListingImportKickoff propertyId={property.id} listingUrl={listingImportUrl} />
      )}

      {/* Attention strip, not a card: a single quiet line when all is well,
          count chips + gap prompts when something needs the host. Reuses the
          home dashboard's dash-attn pattern. */}
      <div className={`dash-attn rise-in${needsAttention === 0 ? ' dash-attn-clear' : ''}`} style={{ marginBottom: '1.25rem' }}>
        <span className={`dash-attn-icon${needsAttention === 0 ? ' dash-attn-icon-clear' : ''}`} aria-hidden>
          {needsAttention === 0 ? <Check size={15} /> : <AlertTriangle size={15} />}
        </span>
        <div className="dash-attn-body">
          <strong className="dash-attn-title">{needsAttention === 0 ? 'All clear' : 'Needs attention'}</strong>
          <span className="dash-attn-sub">
            {needsAttention === 0
              ? 'No open escalations or Brain gaps — the concierge has things covered.'
              : `${needsAttention} item${needsAttention === 1 ? '' : 's'} to review across guest support and your Brain.`}
          </span>
          {needsAttention > 0 && (
            <div className="dash-attn-chips">
              <Link href={`${base}/inbox`} className="dash-attn-chip dash-attn-chip-link">
                <strong>{openEsc ?? 0}</strong> open escalation{openEsc === 1 ? '' : 's'}
              </Link>
              <Link href={`${base}/brain`} className="dash-attn-chip dash-attn-chip-link">
                <strong>{health.gaps.length}</strong> Brain gap{health.gaps.length === 1 ? '' : 's'}
              </Link>
            </div>
          )}
          {prompts.length > 0 && (
            <ul className="muted" style={{ fontSize: '.82rem', margin: '.75rem 0 0', paddingLeft: '1.1rem' }}>
              {prompts.map((prompt, index) => <li key={index} style={{ marginBottom: '.25rem' }}>{prompt}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* One tile per job-to-be-done. Escalations deep-links into the Property
          Inbox — it earns its own tile because the open count is an attention
          metric, not navigation. Configuration stays last. */}
      <section aria-labelledby="property-workspace-heading">
        <h2 id="property-workspace-heading" className="sr-only">Workspace</h2>
        <div className="prop-tile-grid" style={{ marginBottom: '1.25rem' }}>
          <Tile href={`${base}/brain`} icon={Brain} title="Brain" value={`${health.totalItems} items`} sub="Knowledge base" />
          <Tile href={`${base}/stays`} icon={CalendarDays} title="Stays" value={`${stayCount ?? 0}`} sub="Guest bookings" />
          <Tile href={`${base}/inbox`} icon={LifeBuoy} title="Escalations" value={`${openEsc ?? 0} open`} sub="Guest questions & issues" attention={(openEsc ?? 0) > 0} />
          {(can.editProperty || can.editBrain) && (
            <Tile href={`${base}/extras`} icon={Sparkles} title="Extras" value={`${openExtras ?? 0} open`} sub="Add-ons guests can request" />
          )}
          <Tile href={`${base}/local`} icon={MapPin} title="Local Recs" value={localCount > 0 ? `${localCount} places` : 'Set up'} sub="What your concierge recommends" />
          <Tile href="/dashboard/service-requests" icon={Wrench} title="Service" value={`${openService ?? 0} open`} sub="Maintenance requests" attention={(openService ?? 0) > 0} />
          <Tile href={`${base}/stays`} icon={CalendarCheck} title="Arrivals" value={`${arrivalsWeek ?? 0} this week`} sub="Check-ins in the next 7 days" />
          {can.editProperty && <Tile href={`${base}/settings`} icon={Settings} title="Configuration" value="Configure" sub="Branding, tone, modules" />}
        </div>
      </section>

      <div className="prop-duo">
        {/* Property Inbox: the newest open guest questions. A row opens the
            chat thread itself; the footer opens the full Property Inbox page. */}
        <section className="card prop-panel rise-in" aria-labelledby="property-inbox-heading">
          <div className="prop-panel-head">
            <h2 id="property-inbox-heading">
              <LifeBuoy size={15} aria-hidden /> Property Inbox
            </h2>
            {(openEsc ?? 0) > 0 && <span className="badge badge-coral">{openEsc} open</span>}
          </div>
          {inbox.length > 0 ? (
            <div className="dash-feed">
              {inbox.map((esc) => {
                const party = esc.stay_id ? partyByStayId.get(esc.stay_id) : undefined;
                const identityId = esc.conversation_id ? identityByConvoId.get(esc.conversation_id) : undefined;
                const firstName = identityId ? nameByIdentityId.get(identityId) : undefined;
                const meta = [firstName, party, dayFormat.format(new Date(esc.created_at))].filter(Boolean).join(' | ');
                const href = esc.stay_id && esc.conversation_id
                  ? `${base}/stays/${esc.stay_id}/conversations/${esc.conversation_id}`
                  : `${base}/inbox`;
                return (
                  <Link key={esc.id} href={href} className="dash-feed-link">
                    <span className="dash-feed-icon" aria-hidden>
                      <LifeBuoy size={14} />
                    </span>
                    <span className="dash-feed-main">
                      <span className="dash-feed-detail" style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {esc.question || 'Guest question'}
                      </span>
                      <span className="dash-feed-meta">{meta}</span>
                    </span>
                    <span className="btn btn-ghost btn-sm" style={{ flexShrink: 0, alignSelf: 'center' }}>Open thread</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: '.85rem', margin: 0, lineHeight: 1.5 }}>
              No open guest questions. Anything the concierge cannot answer lands here first.
            </p>
          )}
          <Link href={`${base}/inbox`} className="dash-panel-link">Open inbox →</Link>
        </section>

        {/* Guest access: the stable portal link plus the QR/print entry point.
            The QR never needs "generating" — the welcome card renders it on
            demand, and verification at the portal is what protects the stay. */}
        <section className="card prop-panel rise-in" aria-labelledby="guest-access-heading">
          <div className="prop-panel-head">
            <h2 id="guest-access-heading">
              <QrCode size={15} aria-hidden /> Guest access
            </h2>
          </div>
          <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .9rem', lineHeight: 1.5 }}>
            Guests scan the portal QR and verify with the contact on their booking — their stay code unlocks the right stay.
          </p>
          {portalUrl && (
            <div className="card-2" style={{ padding: '.55rem .75rem', display: 'flex', alignItems: 'center', gap: '.75rem', justifyContent: 'space-between' }}>
              <span className="portal-url">{portalUrl}</span>
              <CopyPortalLink url={portalUrl} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.9rem' }}>
            <Link href={`${base}/welcome-card`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              <QrCode size={15} aria-hidden /> View QR &amp; print card
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  value,
  sub,
  attention = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  value: string;
  sub: string;
  attention?: boolean;
}) {
  return (
    <Link href={href} className={`card card-interactive rise-in prop-tile${attention ? ' prop-tile-attn' : ''}`}>
      <div className="prop-tile-head">
        <span className="prop-tile-title">{title}</span>
        <span className="prop-tile-icon" aria-hidden>
          <Icon size={17} />
        </span>
      </div>
      <div className="prop-tile-value">{value}</div>
      <div className="prop-tile-sub muted">{sub}</div>
      <ArrowRight size={15} className="prop-tile-arrow" aria-hidden />
    </Link>
  );
}
