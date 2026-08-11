import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth, gapPrompts } from '@/lib/brain/health';
import { listPropertySessions } from '@/lib/guest/sessions';
import { SessionsPanel } from './SessionsPanel';
import { PropertyLinkMinter } from './PropertyLinkMinter';
import { ListingImportKickoff } from './ListingImportKickoff';
import { DangerZone } from './DangerZone';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { import?: string };
}) {
  const access = await requirePropertyAccess(params.id);
  const { property, can } = access;
  const supabase = createClient();

  const [
    { data: items },
    { count: stayCount },
    { count: openEsc },
    { count: curatedCount },
    { count: discoveredCount },
  ] = await Promise.all([
    supabase.from('brain_items').select('category, status, deleted_at, visibility').eq('property_id', property.id),
    supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', property.id).is('deleted_at', null),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('status', 'open'),
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('approved', true).eq('hidden', false).is('deleted_at', null),
    supabase.from('nearby_places').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('hidden', false),
  ]);

  const health = computeBrainHealth(items ?? []);
  const prompts = gapPrompts(health);
  // Upper bound, not the merged total: dedupe happens at read time in lib/local/merge.
  const localCount = (curatedCount ?? 0) + (discoveredCount ?? 0);

  // Only an https listing link is ever handed to the client importer; anything
  // else in the query string is ignored outright.
  const rawImport = typeof searchParams.import === 'string' ? searchParams.import.trim() : '';
  const listingImportUrl = /^https?:\/\//i.test(rawImport) && rawImport.length <= 2000 ? rawImport : null;

  // Stays is the natural home for guest access management. It cannot be moved
  // there in this scoped change, so it remains available here behind a collapsed
  // disclosure rather than removing host functionality.
  const canManageAccess = can.replyGuests;
  const sessions = canManageAccess ? await listPropertySessions(property.id, true) : [];
  const needsAttention = (openEsc ?? 0) + health.gaps.length;

  return (
    <div>
      {listingImportUrl && can.editBrain && (
        <ListingImportKickoff propertyId={property.id} listingUrl={listingImportUrl} />
      )}

      <section className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1.25rem' }} aria-labelledby="needs-attention-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <h2 id="needs-attention-heading" style={{ fontSize: '1rem', margin: 0 }}>Needs attention</h2>
            <p className="muted" style={{ fontSize: '.84rem', margin: '.25rem 0 0' }}>
              {needsAttention === 0 ? 'Everything is looking good.' : `${needsAttention} item${needsAttention === 1 ? '' : 's'} to review across guest support and your Brain.`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Link href={`/dashboard/properties/${property.id}/escalations`} className={`badge ${openEsc ? 'badge-coral' : ''}`} style={{ minHeight: '2.75rem', display: 'inline-flex', alignItems: 'center', textDecoration: 'none', paddingInline: '.65rem' }}>
              {openEsc ?? 0} open escalation{openEsc === 1 ? '' : 's'}
            </Link>
            <Link href={`/dashboard/properties/${property.id}/brain`} className="badge" style={{ minHeight: '2.75rem', display: 'inline-flex', alignItems: 'center', textDecoration: 'none', paddingInline: '.65rem' }}>
              {health.gaps.length} Brain gap{health.gaps.length === 1 ? '' : 's'}
            </Link>
          </div>
        </div>
        {prompts.length > 0 && (
          <ul className="muted" style={{ fontSize: '.82rem', margin: '.85rem 0 0', paddingLeft: '1.1rem' }}>
            {prompts.map((prompt, index) => <li key={index} style={{ marginBottom: '.25rem' }}>{prompt}</li>)}
          </ul>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Tile href={`/dashboard/properties/${property.id}/brain`} title="Brain" value={`${health.totalItems} items`} sub="Knowledge base" />
        <Tile href={`/dashboard/properties/${property.id}/stays`} title="Stays" value={`${stayCount ?? 0}`} sub="Guest bookings" />
        <Tile href={`/dashboard/properties/${property.id}/escalations`} title="Escalations" value={`${openEsc ?? 0} open`} sub="Guest questions & issues" />
        <Tile href={`/dashboard/properties/${property.id}/local`} title="Local" value={localCount > 0 ? `${localCount} places` : 'Set up'} sub="What your concierge recommends" />
        {can.editProperty && <Tile href={`/dashboard/properties/${property.id}/extras`} title="Extras" value="Manage" sub="Add-ons guests can request" />}
        {can.editProperty && <Tile href={`/dashboard/properties/${property.id}/settings`} title="Settings" value="Configure" sub="Branding, tone, modules" />}
      </div>

      {canManageAccess && (
        <details className="card" style={{ padding: '0 1rem', marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', minHeight: '2.75rem', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
            Guest access
          </summary>
          <div style={{ paddingBottom: '.25rem' }}>
            <PropertyLinkMinter propertyId={property.id} />
            <SessionsPanel propertyId={property.id} initialSessions={sessions} />
          </div>
        </details>
      )}

      {can.editProperty && <DangerZone propertyId={property.id} propertyName={property.display_name} />}
    </div>
  );
}

function Tile({ href, title, value, sub }: { href: string; title: string; value: string; sub: string }) {
  return (
    <Link href={href} className="card card-interactive rise-in" style={{ padding: '1.1rem', display: 'block', minHeight: '8.5rem' }}>
      <div className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 600, margin: '.2rem 0' }}>{value}</div>
      <div className="muted" style={{ fontSize: '.8rem' }}>{sub}</div>
    </Link>
  );
}
