import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  CalendarDays,
  LifeBuoy,
  MapPin,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth, gapPrompts } from '@/lib/brain/health';
import { ListingImportKickoff } from './ListingImportKickoff';

export const dynamic = 'force-dynamic';

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

  const [
    { data: items },
    { count: stayCount },
    { count: openEsc },
    { count: curatedCount },
    { count: discoveredCount },
    { count: openExtras },
  ] = await Promise.all([
    supabase.from('brain_items').select('category, status, deleted_at, visibility').eq('property_id', property.id),
    supabase.from('stays').select('id', { count: 'exact', head: true }).eq('property_id', property.id).is('deleted_at', null),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('status', 'open'),
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('approved', true).eq('hidden', false).is('deleted_at', null),
    supabase.from('nearby_places').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('hidden', false),
    supabase.from('extras_orders').select('id', { count: 'exact', head: true }).eq('property_id', property.id).not('fulfillment_status', 'in', '("fulfilled","declined","canceled","expired","refunded")'),
  ]);

  const health = computeBrainHealth(items ?? []);
  const prompts = gapPrompts(health);
  // Upper bound, not the merged total: dedupe happens at read time in lib/local/merge.
  const localCount = (curatedCount ?? 0) + (discoveredCount ?? 0);

  // Only an https listing link is ever handed to the client importer; anything
  // else in the query string is ignored outright.
  const rawImport = typeof searchParams.import === 'string' ? searchParams.import.trim() : '';
  const listingImportUrl = /^https?:\/\//i.test(rawImport) && rawImport.length <= 2000 ? rawImport : null;

  // Guest access management lives in the Stays tab (per-stay portal + sessions);
  // the reusable property QR link lives in Settings.
  const needsAttention = (openEsc ?? 0) + health.gaps.length;

  return (
    <div>
      {listingImportUrl && can.editBrain && (
        <ListingImportKickoff propertyId={property.id} listingUrl={listingImportUrl} />
      )}

      <section className="card rise-in" style={{ padding: '1rem 1.1rem', marginBottom: '1.25rem' }} aria-labelledby="needs-attention-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <h2 id="needs-attention-heading" style={{ fontSize: '1rem', margin: 0 }}>Needs attention</h2>
            <p className="muted" style={{ fontSize: '.84rem', margin: '.25rem 0 0' }}>
              {needsAttention === 0 ? 'Everything is looking good.' : `${needsAttention} item${needsAttention === 1 ? '' : 's'} to review across guest support and your Brain.`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Link href={`/dashboard/properties/${property.id}/stays`} className={`badge badge-lg${openEsc ? ' badge-coral' : ''}`}>
              {openEsc ?? 0} open escalation{openEsc === 1 ? '' : 's'}
            </Link>
            <Link href={`/dashboard/properties/${property.id}/brain`} className="badge badge-lg">
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

      {/* One tile per job-to-be-done. The old grid had a pair of Extras tiles
          pointing at the same place; that duplicate is merged. Escalations
          still deep-links into the merged Stays tab, where guest conversations
          live — it earns its own tile because the open count is an attention
          metric, not navigation. */}
      <section aria-labelledby="property-workspace-heading">
        <h2 id="property-workspace-heading" className="sr-only">Workspace</h2>
        <div className="prop-tile-grid">
          <Tile href={`/dashboard/properties/${property.id}/brain`} icon={Brain} title="Brain" value={`${health.totalItems} items`} sub="Knowledge base" />
          <Tile href={`/dashboard/properties/${property.id}/stays`} icon={CalendarDays} title="Stays" value={`${stayCount ?? 0}`} sub="Guest bookings" />
          <Tile href={`/dashboard/properties/${property.id}/stays`} icon={LifeBuoy} title="Escalations" value={`${openEsc ?? 0} open`} sub="Guest questions & issues" attention={(openEsc ?? 0) > 0} />
          {(can.editProperty || can.editBrain) && (
            <Tile href={`/dashboard/properties/${property.id}/extras`} icon={Sparkles} title="Extras" value={`${openExtras ?? 0} open`} sub="Add-ons guests can request" />
          )}
          <Tile href={`/dashboard/properties/${property.id}/local`} icon={MapPin} title="Local Recs" value={localCount > 0 ? `${localCount} places` : 'Set up'} sub="What your concierge recommends" />
          {can.editProperty && <Tile href={`/dashboard/properties/${property.id}/settings`} icon={Settings} title="Configuration" value="Configure" sub="Branding, tone, modules" />}
        </div>
      </section>

      {/* Permanent delete moved to the bottom of Configuration — the only
          surface gated to property editors — so this page stays focused on
          day-to-day work. See settings/page.tsx for the DangerZone. */}
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
