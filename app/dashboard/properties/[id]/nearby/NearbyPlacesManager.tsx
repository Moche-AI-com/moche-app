'use client';

import { useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Star, EyeOff, Eye, RefreshCw, StickyNote, MapPin, Phone, Globe, Navigation } from 'lucide-react';
import StaticMapPreview from '@/components/StaticMapPreview';
import { directionsUrl } from '@/lib/local/static-map';
import {
  refreshNearbyPlacesAction,
  updateNearbyPlaceAction,
  type NearbyActionState,
} from './actions';

interface Place {
  id: string;
  place_id: string | null;
  category: string;
  name: string | null;
  rating: number | null;
  review_count: number | null;
  lat: number | null;
  lng: number | null;
  price_level: number | null;
  host_starred: boolean;
  host_notes: string | null;
  hidden: boolean;
  distance_m: number | null;
  refreshed_at: string;
  address: string | null;
  url: string | null;
  phone: string | null;
  source: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurants',
  cafe: 'Cafes',
  bar: 'Bars & pubs',
  grocery: 'Groceries',
  pharmacy: 'Pharmacies',
  hospital: 'Hospitals',
  tourist_attraction: 'Attractions',
  golf_course: 'Golf courses',
  convenience_store: 'Convenience stores',
  bakery: 'Bakeries',
  park: 'Parks',
  gas_station: 'Gas stations',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '.25rem',
  color: 'var(--teal-deep, #0f766e)',
  textDecoration: 'none',
};

function metersToFriendly(m: number | null): string | null {
  if (m == null) return null;
  if (m < 950) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function RefreshButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn"
      disabled={pending || disabled}
      data-testid="nearby-refresh"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
    >
      <RefreshCw size={15} className={pending ? 'spin' : undefined} />
      {pending ? 'Refreshing…' : 'Refresh nearby places'}
    </button>
  );
}

function IconSubmit({ children, title, testId }: { children: ReactNode; title: string; testId?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-ghost"
      disabled={pending}
      title={title}
      aria-label={title}
      data-testid={testId}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem', padding: '.25rem .4rem' }}
    >
      {children}
    </button>
  );
}

export function NearbyPlacesManager({
  propertyId,
  canEdit,
  hasCoords,
  propertyLat,
  propertyLng,
  initialPlaces,
}: {
  propertyId: string;
  canEdit: boolean;
  hasCoords: boolean;
  propertyLat?: number | null;
  propertyLng?: number | null;
  initialPlaces: Place[];
}) {
  const router = useRouter();
  const [refreshState, refreshAction] = useFormState<NearbyActionState, FormData>(refreshNearbyPlacesAction, {});
  const [filter, setFilter] = useState<string>('all');
  const [starredOnly, setStarredOnly] = useState(false);

  const visible = initialPlaces.filter((p) => !p.hidden);
  const hidden = initialPlaces.filter((p) => p.hidden);
  const starredCount = initialPlaces.filter((p) => p.host_starred).length;

  const filtered = visible.filter(
    (p) => (filter === 'all' || p.category === filter) && (!starredOnly || p.host_starred),
  );

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: filtered.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  // Pins for the overview map: starred places in coral so the host can see their
  // curated set at a glance, everything else in iris.
  const pins = filtered
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    .sort((a, b) => Number(b.host_starred) - Number(a.host_starred) || (a.distance_m ?? 0) - (b.distance_m ?? 0))
    .slice(0, 18)
    .map((p) => ({ lat: p.lat as number, lng: p.lng as number, color: p.host_starred ? 'f97362' : '6366f1' }));

  const availableCategories = CATEGORY_ORDER.filter((cat) => visible.some((p) => p.category === cat));

  return (
    <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1.5rem' }}>
      <section className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Auto-find</h3>
            <p className="muted" style={{ fontSize: '.85rem', margin: '.3rem 0 0' }}>
              {initialPlaces.length} place{initialPlaces.length === 1 ? '' : 's'} found · {starredCount} starred · {hidden.length} hidden
            </p>
          </div>
          <form action={refreshAction}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <RefreshButton disabled={!hasCoords || !canEdit} />
          </form>
        </div>
        {!hasCoords && (
          <p style={{ color: 'var(--coral, #c0392b)', fontSize: '.85rem', marginTop: '.6rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <MapPin size={14} /> Set the property location in Settings → Address first.
          </p>
        )}
        {refreshState.error && (
          <p style={{ color: 'var(--coral, #c0392b)', fontSize: '.85rem', marginTop: '.5rem' }}>{refreshState.error}</p>
        )}
        {refreshState.ok && (
          <p style={{ color: 'var(--teal, #1e7e34)', fontSize: '.85rem', marginTop: '.5rem' }}>
            {refreshState.found === 0 ? 'No places found nearby.' : `Updated — ${refreshState.found} place(s) nearby.`}
          </p>
        )}
      </section>

      {hasCoords && (
        <StaticMapPreview
          lat={propertyLat}
          lng={propertyLng}
          markers={pins}
          height={260}
          width={1100}
          caption={
            pins.length > 0
              ? `Your property (teal) and ${pins.length} nearby place${pins.length === 1 ? '' : 's'} — starred ones in coral.`
              : 'Your property location.'
          }
        />
      )}

      {availableCategories.length > 1 && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={visible.length} />
          {availableCategories.map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABEL[cat] ?? cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              count={visible.filter((p) => p.category === cat).length}
            />
          ))}
          {starredCount > 0 && (
            <FilterChip
              label="Starred"
              active={starredOnly}
              onClick={() => setStarredOnly((s) => !s)}
              count={starredCount}
              icon={<Star size={12} fill={starredOnly ? 'currentColor' : 'none'} aria-hidden />}
            />
          )}
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="muted" style={{ fontSize: '.9rem' }}>
          {visible.length === 0
            ? `No places yet. ${hasCoords ? 'Click “Refresh nearby places” to discover them.' : 'Add the property location to get started.'}`
            : 'No places match this filter.'}
        </p>
      ) : (
        grouped.map(({ cat, items }) => (
          <section key={cat}>
            <h3 style={{ marginBottom: '.5rem' }}>{CATEGORY_LABEL[cat] ?? cat} <span className="muted" style={{ fontWeight: 400 }}>({items.length})</span></h3>
            <div style={{ display: 'grid', gap: '.6rem' }}>
              {items.map((place) => (
                <PlaceCard key={place.id} place={place} propertyId={propertyId} canEdit={canEdit} onDone={() => router.refresh()} />
              ))}
            </div>
          </section>
        ))
      )}

      {hidden.length > 0 && (
        <section>
          <h3 className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <EyeOff size={16} /> Hidden ({hidden.length})
          </h3>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {hidden.map((place) => (
              <PlaceCard key={place.id} place={place} propertyId={propertyId} canEdit={canEdit} onDone={() => router.refresh()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.3rem',
        padding: '.3rem .6rem',
        fontSize: '.78rem',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
        background: active ? 'var(--teal)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text)',
        transition: 'background var(--tr, .15s) var(--ease-out, ease)',
      }}
    >
      {icon}
      {label}
      <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}

function PlaceCard({
  place,
  propertyId,
  canEdit,
}: {
  place: Place;
  propertyId: string;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [, action] = useFormState<NearbyActionState, FormData>(updateNearbyPlaceAction, {});
  const [noteOpen, setNoteOpen] = useState(false);
  const dist = metersToFriendly(place.distance_m);

  return (
    <div className="card" style={{ padding: '.75rem 1rem', opacity: place.hidden ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
            {place.host_starred && <Star size={14} fill="currentColor" style={{ color: 'var(--iris, #7C6FF0)' }} />}
            {place.name}
          </strong>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {dist ? `${dist} away` : null}
            {place.rating != null ? `${dist ? ' · ' : ''}${place.rating}★` : ''}
            {place.address ? `${dist || place.rating != null ? ' · ' : ''}${place.address}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '.3rem', fontSize: '.78rem' }}>
            {place.phone && (
              <a href={`tel:${place.phone}`} style={linkStyle}>
                <Phone size={12} aria-hidden /> {place.phone}
              </a>
            )}
            {place.url && (
              <a href={place.url} target="_blank" rel="noopener noreferrer nofollow" style={linkStyle}>
                <Globe size={12} aria-hidden /> Website
              </a>
            )}
            {place.lat != null && place.lng != null && (
              <a
                href={directionsUrl(place.lat, place.lng, place.name ?? undefined)}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                <Navigation size={12} aria-hidden /> Directions
              </a>
            )}
          </div>
          {place.host_notes && <p style={{ fontSize: '.82rem', margin: '.35rem 0 0' }}>{place.host_notes}</p>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="placeId" value={place.id} />
              <input type="hidden" name="host_starred" value={place.host_starred ? 'false' : 'true'} />
              <IconSubmit title={place.host_starred ? 'Unstar' : 'Star'} testId="nearby-star">
                <Star size={15} fill={place.host_starred ? 'currentColor' : 'none'} />
              </IconSubmit>
            </form>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setNoteOpen((o) => !o)}
              title="Add a note"
              aria-label="Add a note"
              data-testid="nearby-note-toggle"
              style={{ display: 'inline-flex', alignItems: 'center', fontSize: '.8rem', padding: '.25rem .4rem' }}
            >
              <StickyNote size={15} />
            </button>
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="placeId" value={place.id} />
              <input type="hidden" name="hidden" value={place.hidden ? 'false' : 'true'} />
              <IconSubmit title={place.hidden ? 'Unhide' : 'Hide'} testId="nearby-hide">
                {place.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
              </IconSubmit>
            </form>
          </div>
        )}
      </div>
      {noteOpen && canEdit && (
        <form action={action} style={{ marginTop: '.5rem', display: 'flex', gap: '.4rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="placeId" value={place.id} />
          <input
            name="host_notes"
            defaultValue={place.host_notes ?? ''}
            placeholder="A note your concierge can share (e.g. “Best paella, book ahead”)"
            className="input"
            data-testid="nearby-note-input"
            style={{ flex: 1 }}
          />
          <IconSubmit title="Save note">Save</IconSubmit>
        </form>
      )}
    </div>
  );
}
