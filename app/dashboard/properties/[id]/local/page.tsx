import Link from 'next/link';
import { MapPin, Star, Pencil, Compass } from 'lucide-react';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { formatDistanceApprox } from '@/lib/local/distance';
import { LocalSearch } from './LocalSearch';
import {
  localCategoryLabel,
  mergeLocalPlaces,
  type CuratedRecInput,
  type DiscoveredPlaceInput,
} from '@/lib/local/merge';

export const dynamic = 'force-dynamic';

/**
 * The unified Local surface (backlog P4-12).
 *
 * Two systems feed the concierge's local knowledge: host-authored
 * `recommendations` and auto-discovered `nearby_places`. Each has its own
 * manager page, and neither could answer the question a host actually asks -
 * "what will my guest be told?" This page answers exactly that by running the
 * same merge the concierge runs (lib/local/merge) and rendering the result.
 *
 * Deliberately read-only. Editing stays in the two managers, which own their
 * distinct capabilities (approval workflow and priority weighting on one side,
 * auto-refresh and ratings on the other). This is a lens, not a third editor.
 */
export default async function LocalOverviewPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();

  const [curatedRes, discoveredRes] = await Promise.all([
    supabase
      .from('recommendations')
      .select('id, name, category, host_preference, approved, hidden, host_note, description, distance_note, priority_weight')
      .eq('property_id', params.id)
      .is('deleted_at', null)
      .order('priority_weight', { ascending: false })
      .order('name', { ascending: true }),
    supabase
      .from('nearby_places')
      .select('id, name, category, host_notes, host_starred, hidden, rating, distance_m')
      .eq('property_id', params.id)
      .order('distance_m', { ascending: true }),
  ]);

  const curatedAll = (curatedRes.data ?? []) as CuratedRecInput[];
  const discoveredAll = (discoveredRes.data ?? []) as DiscoveredPlaceInput[];

  // mergeLocalPlaces applies the guest-visibility rules itself, so passing the
  // full sets here is what makes this page an honest preview rather than a
  // second, drifting interpretation of those rules.
  const guestVisible = mergeLocalPlaces(curatedAll, discoveredAll);

  const pendingApproval = curatedAll.filter((r) => !r.approved && !r.hidden).length;
  const hiddenCount =
    curatedAll.filter((r) => r.hidden).length + discoveredAll.filter((p) => p.hidden).length;
  const favorites = guestVisible.filter((p) => p.host_starred);
  const rest = guestVisible.filter((p) => !p.host_starred);

  const byCategory = new Map<string, typeof rest>();
  for (const p of rest) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const categories = [...byCategory.entries()].sort((a, b) =>
    localCategoryLabel(a[0]).localeCompare(localCategoryLabel(b[0])),
  );

  const sourceBadge = (source: 'curated' | 'discovered') => (
    <span
      className="faint"
      style={{
        fontSize: '.7rem',
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '.1rem .35rem',
        whiteSpace: 'nowrap',
      }}
    >
      {source === 'curated' ? 'Your pick' : 'Discovered'}
    </span>
  );

  const row = (p: (typeof guestVisible)[number]) => (
    <li key={p.id} className="report-list-row">
      <div className="report-list-title" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
        {p.host_starred && <Star size={14} aria-hidden style={{ flexShrink: 0 }} />}
        <span>{p.name ?? 'Unnamed place'}</span>
        {sourceBadge(p.source)}
      </div>
      <div className="report-list-meta">
        {localCategoryLabel(p.category)}
        {p.distance_m !== null
          ? formatDistanceApprox(p.distance_m)
          : p.distanceNote
            ? ` (${p.distanceNote})`
            : ''}
        {p.rating !== null ? ` · ${p.rating.toFixed(1)}★` : ''}
      </div>
      {p.detail && (
        <div className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
          {p.detail}
        </div>
      )}
      {p.host_notes && (
        <div className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>
          Your note: {p.host_notes}
        </div>
      )}
    </li>
  );

  return (
    <div>
      <h1 style={{ marginTop: '.5rem' }}>Local</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Everything your concierge can recommend, exactly as it ranks it. Your own picks come from
        Local recommendations; the rest are discovered automatically near the property. Favorites
        are always offered first.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '.5rem',
          flexWrap: 'wrap',
          margin: '1rem 0',
        }}
      >
        {access.can.editBrain && (
          <Link href={`/dashboard/properties/${params.id}/recommendations`} className="btn btn-sm">
            <Pencil size={14} aria-hidden /> Edit your picks
          </Link>
        )}
        {access.can.editProperty && (
          <Link href={`/dashboard/properties/${params.id}/nearby`} className="btn btn-sm btn-ghost">
            <Compass size={14} aria-hidden /> Manage discovered places
          </Link>
        )}
      </div>

      {(access.isOwner || access.can.editBrain) && <LocalSearch propertyId={params.id} />}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div className="faint" style={{ fontSize: '.75rem' }}>Guests can see</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{guestVisible.length}</div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: '.75rem' }}>Favorites</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{favorites.length}</div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: '.75rem' }}>Awaiting your approval</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{pendingApproval}</div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: '.75rem' }}>Hidden</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{hiddenCount}</div>
          </div>
        </div>
        {pendingApproval > 0 && access.can.editBrain && (
          <p className="muted" style={{ fontSize: '.85rem', marginTop: '.75rem', marginBottom: 0 }}>
            {pendingApproval} of your picks {pendingApproval === 1 ? 'is' : 'are'} not approved yet, so
            your concierge will not mention {pendingApproval === 1 ? 'it' : 'them'}.{' '}
            <Link href={`/dashboard/properties/${params.id}/recommendations`}>Review them</Link>.
          </p>
        )}
      </div>

      {guestVisible.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <MapPin size={24} aria-hidden style={{ opacity: 0.5 }} />
          <h2 style={{ fontSize: '1rem', margin: '.75rem 0 .25rem' }}>Nothing local yet</h2>
          <p className="muted" style={{ fontSize: '.9rem', maxWidth: 420, margin: '0 auto 1rem' }}>
            Add the spots you send every guest to, or set the property address so nearby places can be
            discovered for you.
          </p>
          {access.can.editBrain && (
            <Link href={`/dashboard/properties/${params.id}/recommendations`} className="btn btn-sm btn-primary">
              Add your first pick
            </Link>
          )}
        </div>
      ) : (
        <>
          {favorites.length > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '.5rem' }}>
                Favorites <span className="faint" style={{ fontWeight: 400 }}>· recommended first</span>
              </h2>
              <ul className="report-list">{favorites.map(row)}</ul>
            </section>
          )}
          {categories.map(([category, places]) => (
            <section key={category} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '.5rem' }}>{localCategoryLabel(category)}</h2>
              <ul className="report-list">{places.map(row)}</ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
