import { MapPin, Star } from 'lucide-react';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LocalPlaceManager } from './LocalPlaceManager';
import { LocalSearch } from './LocalSearch';
import { loadCanonicalPlaces } from '@/lib/local/canonical';
import { localCategoryLabel } from '@/lib/local/merge';

export const dynamic = 'force-dynamic';

export default async function LocalOverviewPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();
  const places = await loadCanonicalPlaces(supabase, params.id);

  const guestVisible = places.filter((place) => place.status !== 'hidden');
  const favorites = guestVisible.filter((place) => place.isFavorite);
  const pendingApproval = places.filter((place) => place.status === 'suggested').length;
  const hiddenCount = places.filter((place) => place.status === 'hidden').length;
  const rest = guestVisible.filter((place) => !place.isFavorite);
  const byCategory = new Map<string, typeof rest>();
  for (const place of rest) {
    const list = byCategory.get(place.category) ?? [];
    list.push(place);
    byCategory.set(place.category, list);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) =>
    localCategoryLabel(a).localeCompare(localCategoryLabel(b)),
  );

  const row = (place: (typeof guestVisible)[number]) => (
    <li key={place.recommendationId} className="report-list-row">
      <div className="report-list-title" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
        {place.isFavorite && <Star size={14} aria-hidden style={{ flexShrink: 0 }} />}
        <span>{place.name}</span>
        <span
          className="faint"
          style={{
            fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.1rem .35rem',
          }}
        >
          {place.provider}
        </span>
      </div>
      <div className="report-list-meta">
        {localCategoryLabel(place.category)}
        {place.distanceMiles != null ? ` · ${place.distanceMiles.toFixed(1)} mi` : ''}
      </div>
      {place.hostNote && (
        <div className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>
          Your note: {place.hostNote}
        </div>
      )}
    </li>
  );

  return (
    <div>
      <h1 style={{ marginTop: '.5rem' }}>Local</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Everything your concierge can recommend, exactly as it ranks it. Manage your local knowledge,
        host notes, tags, favorites, and guest visibility in one place.
      </p>

      {(access.isOwner || access.can.editBrain) && <LocalSearch propertyId={params.id} />}

      <div className="card" style={{ margin: '1.25rem 0' }}>
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
      </div>

      {guestVisible.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <MapPin size={24} aria-hidden style={{ opacity: 0.5 }} />
          <h2 style={{ fontSize: '1rem', margin: '.75rem 0 .25rem' }}>Nothing local yet</h2>
          <p className="muted" style={{ fontSize: '.9rem', maxWidth: 420, margin: '0 auto' }}>
            Add the spots you send every guest to with the manager below.
          </p>
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
          {categories.map(([category, categoryPlaces]) => (
            <section key={category} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '.5rem' }}>{localCategoryLabel(category)}</h2>
              <ul className="report-list">{categoryPlaces.map(row)}</ul>
            </section>
          ))}
        </>
      )}

      {access.can.editBrain && (
        <LocalPlaceManager propertyId={params.id} places={places} canEdit={access.can.editBrain} />
      )}
    </div>
  );
}
