import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth, gapPrompts } from '@/lib/brain/health';
import { publicEnv, serverEnv } from '@/lib/env';
import { listPropertySessions } from '@/lib/guest/sessions';
import { PropertyStatusControls } from './StatusControls';
import { SessionsPanel } from './SessionsPanel';
import { PropertyLinkMinter } from './PropertyLinkMinter';
import { CopyPortalLink } from './CopyPortalLink';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = { live: 'badge-teal', paused: 'badge-coral' };

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const { property, can } = access;
  const supabase = createClient();

  const [
    { data: items },
    { data: settings },
    { count: stayCount },
    { count: openEsc },
    { count: curatedCount },
    { count: discoveredCount },
  ] = await Promise.all([
    supabase.from('brain_items').select('category, status, deleted_at, visibility').eq('property_id', property.id),
    supabase.from('property_settings').select('*').eq('property_id', property.id).maybeSingle(),
    supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', property.id).is('deleted_at', null),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('status', 'open'),
    // Both local sources are counted so the Local tile reflects everything the
    // concierge can recommend, not just the auto-discovered half.
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('approved', true).eq('hidden', false).is('deleted_at', null),
    supabase.from('nearby_places').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('hidden', false),
  ]);

  const health = computeBrainHealth(items ?? []);
  // Upper bound, not the merged total: dedupe happens at read time in
  // lib/local/merge and would cost two full table reads to reproduce here.
  const localCount = (curatedCount ?? 0) + (discoveredCount ?? 0);
  const prompts = gapPrompts(health);
  const portalUrl = `${publicEnv.appUrl}/g/${property.slug}`;

  // Guest access management is available to owners and co-hosts who can reply to guests.
  const canManageAccess = can.replyGuests;
  const sessions = canManageAccess ? await listPropertySessions(property.id, true) : [];

  return (
    <div>
      <Link href="/dashboard/properties" className="muted" style={{ fontSize: '.85rem' }}>← Properties</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', margin: '.5rem 0 1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <h1 style={{ fontSize: '1.8rem' }}>{property.display_name}</h1>
            <span className={`badge ${STATUS_BADGE[property.status] ?? ''}`}>{property.status}</span>
          </div>
          <p className="faint" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
            {[property.city, property.region, property.country].filter(Boolean).join(', ') || 'No location set'} · {property.timezone}
          </p>
        </div>
        {can.editProperty && (
          <PropertyStatusControls
            propertyId={property.id}
            status={property.status}
            canGoLive={health.canGoLive}
            brainRequired={serverEnv.requireBrainToPublish}
          />
        )}
      </div>

      {/* Brain Health */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem' }}>Brain Health</h2>
          <Link href={`/dashboard/properties/${property.id}/brain`} className="btn btn-sm btn-ghost">Manage Brain →</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <ScoreRing score={health.score} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontSize: '.9rem', marginBottom: '.5rem' }}>
              {health.totalItems} knowledge item{health.totalItems === 1 ? '' : 's'} across {health.categories.filter((c) => c.present).length} categories.
            </p>
            {!health.coreComplete ? (
              <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
                Add the core essentials (WiFi/parking, check-in/out, house rules) before this property can go live.
              </div>
            ) : (
              <div className="alert alert-success" style={{ fontSize: '.82rem' }}>Core knowledge complete — ready to go live.</div>
            )}
          </div>
        </div>
        {prompts.length > 0 && (
          <ul className="muted" style={{ fontSize: '.82rem', marginTop: '1rem', paddingLeft: '1.1rem' }}>
            {prompts.map((p, i) => <li key={i} style={{ marginBottom: '.25rem' }}>{p}</li>)}
          </ul>
        )}
      </div>

      {/* Quick tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Tile href={`/dashboard/properties/${property.id}/brain`} title="Brain" value={`${health.totalItems} items`} sub="Knowledge base" />
        <Tile href={`/dashboard/properties/${property.id}/stays`} title="Stays" value={`${stayCount ?? 0}`} sub="Guest bookings" />
        <Tile href={`/dashboard/escalations?property=${property.id}`} title="Escalations" value={`${openEsc ?? 0} open`} sub="Guest questions & issues" />
        <Tile href={`/dashboard/properties/${property.id}/local`} title="Local" value={localCount > 0 ? `${localCount} places` : 'Set up'} sub="What your concierge recommends" />
        {can.editProperty && <Tile href={`/dashboard/properties/${property.id}/extras`} title="Extras" value="Manage" sub="Add-ons guests can request" />}
        {can.editProperty && <Tile href={`/dashboard/properties/${property.id}/settings`} title="Settings" value="Configure" sub="Branding, tone, modules" />}
      </div>

      {/* Guest portal link */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '.6rem' }}>Guest portal</h2>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
          Share this link (or a QR code) with guests. They verify with the contact on their booking before accessing anything.
        </p>
        <div className="card-2" style={{ padding: '.6rem .8rem', fontFamily: 'monospace', fontSize: '.82rem', wordBreak: 'break-all' }}>{portalUrl}</div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.75rem' }}>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-sm"
            data-testid="link-view-portal"
            aria-disabled={property.status !== 'live'}
            style={property.status !== 'live' ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
          >
            Preview as guest ↗
          </a>
          <CopyPortalLink url={portalUrl} />
        </div>
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
          Opens the live guest experience in a new tab. Because you’re signed in as the host, you skip guest verification and see a
          read-only concierge preview — chat with the AI freely; nothing is saved as a guest conversation. On any device where you’re
          logged in, you can open this link without verifying.
        </p>
        {property.status !== 'live' && (
          <p className="faint" style={{ fontSize: '.78rem', marginTop: '.6rem' }}>
            The portal is only reachable once the property is live. You can go live now — the
            Brain and branding can be added anytime.
          </p>
        )}
        {property.status === 'live' && (stayCount ?? 0) === 0 && (
          <p className="faint" style={{ fontSize: '.78rem', marginTop: '.6rem' }}>
            Use “Preview as guest” above to test it yourself. To try the full guest flow (with real verification), add a
            stay with your own email under{' '}
            <Link href={`/dashboard/properties/${property.id}/stays`} className="gradient-text" style={{ fontWeight: 600 }}>Stays</Link>{' '}
            — guests verify with the contact on their booking before entering.
          </p>
        )}
      </div>

      {canManageAccess && (
        <div style={{ marginTop: '1.25rem' }}>
          <PropertyLinkMinter propertyId={property.id} />
          <SessionsPanel propertyId={property.id} initialSessions={sessions} />
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--iris)' : 'var(--coral)';
  return (
    <div
      style={{
        width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`,
      }}
    >
      <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
        <strong style={{ fontSize: '1.4rem' }}>{score}</strong>
      </div>
    </div>
  );
}

function Tile({ href, title, value, sub }: { href: string; title: string; value: string; sub: string }) {
  return (
    <Link href={href} className="card card-interactive rise-in" style={{ padding: '1.1rem', display: 'block' }}>
      <div className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 600, margin: '.2rem 0' }}>{value}</div>
      <div className="muted" style={{ fontSize: '.8rem' }}>{sub}</div>
    </Link>
  );
}
