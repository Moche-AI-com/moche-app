'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Beer,
  Coffee,
  Croissant,
  Flag,
  Fuel,
  Globe,
  HeartPulse,
  Landmark,
  MapPin,
  Moon,
  Navigation,
  Phone,
  Pill,
  Search,
  ShoppingBasket,
  Star,
  Store,
  Sun,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { NEARBY_CATEGORY_LABEL, NEARBY_CATEGORY_LABEL_PLURAL } from '@/lib/local/categories';
import { formatDistance } from '@/lib/local/distance';
import type { GuestLocalPlace } from '@/lib/local/canonical';
import { PORTAL_CSS, usePortalTheme } from '../portalStyles';

// Category → professional line icon (Lucide). Unknown/custom categories fall
// back to a map pin so host-entered categories still render cleanly.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  grocery: ShoppingBasket,
  pharmacy: Pill,
  hospital: HeartPulse,
  tourist_attraction: Landmark,
  golf_course: Flag,
  convenience_store: Store,
  bakery: Croissant,
  park: Trees,
  gas_station: Fuel,
};

function categoryLabel(category: string): string {
  return NEARBY_CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}

function categoryPlural(category: string): string {
  return NEARBY_CATEGORY_LABEL_PLURAL[category] ?? `${categoryLabel(category)}s`;
}

// Keyless universal directions link: opens Google Maps on every device with the
// destination pre-filled (no API key or Google account required — it is a URL,
// not an API call). Prefers exact coordinates; falls back to name + address.
function directionsUrl(place: GuestLocalPlace): string {
  if (typeof place.lat === 'number' && typeof place.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  }
  const q = [place.name, place.address].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function distanceLabel(place: GuestLocalPlace): string | null {
  if (typeof place.distanceMiles === 'number') return formatDistance(place.distanceMiles * 1609.344);
  return place.distanceNote;
}

function PlaceCard({ place }: { place: GuestLocalPlace }) {
  const Icon = CATEGORY_ICON[place.category] ?? MapPin;
  const distance = distanceLabel(place);
  return (
    <article className="gp-place-card">
      <span className="gp-place-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <div className="gp-place-body">
        <div className="gp-place-title">
          {place.name}
          {place.isFavorite ? <span className="gp-badge gp-badge-pick">Host pick</span> : null}
        </div>
        <div className="gp-place-meta">
          <span>{categoryLabel(place.category)}</span>
          {distance ? <span>· {distance}</span> : null}
          {typeof place.rating === 'number' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              · <Star size={12} aria-hidden /> {place.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        {place.detail ? <p className="gp-place-note">{place.detail}</p> : null}
        {place.hostNote ? <p className="gp-place-note"><strong>Host note:</strong> {place.hostNote}</p> : null}
        {place.address ? <p className="gp-place-addr">{place.address}</p> : null}
        <div className="gp-place-actions">
          <a className="gp-place-link" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
            <Navigation size={13} aria-hidden /> Directions
          </a>
          {place.website ? (
            <a className="gp-place-link" href={place.website} target="_blank" rel="noopener noreferrer">
              <Globe size={13} aria-hidden /> Website
            </a>
          ) : null}
          {place.phone ? (
            <a className="gp-place-link" href={`tel:${place.phone}`}>
              <Phone size={13} aria-hidden /> Call
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// The Local Guide: every guest-visible place for the property — restaurants,
// cafes, parks, golf courses, and more — with the host's own picks pinned on
// top, category filters, text search, distance in miles, and directions /
// website / call links per place.
export function LocalGuide(props: {
  fontClassName: string;
  slug: string;
  propertyName: string;
  location: string;
  brandPrimary: string | null;
  brandAccent: string | null;
  logoUrl: string | null;
  places: GuestLocalPlace[];
}) {
  const { theme, toggleTheme } = usePortalTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const brandVars = {
    '--gp-primary': props.brandPrimary ?? '#33E6D4',
    '--gp-accent': props.brandAccent ?? '#FF8A5C',
  } as CSSProperties;

  const categories = useMemo(() => {
    const present = Array.from(new Set(props.places.map((p) => p.category)));
    return present.sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [props.places]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.places.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return [p.name, p.address, p.hostNote, p.detail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [props.places, query, category]);

  const filtering = category !== 'all' || query.trim().length > 0;
  const favorites = filtering ? [] : filtered.filter((p) => p.isFavorite);
  const rest = filtering ? filtered : filtered.filter((p) => !p.isFavorite);

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <div className={`gp-v2 ${theme === 'light' ? 'gp-light' : ''} ${props.fontClassName}`} style={brandVars}>
      <style>{PORTAL_CSS}</style>
      <div className="gp-wrap">
        <header className="gp-header">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" className="gp-logo" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icon.svg" alt="Moche AI" className="gp-logo" />
          )}
          <div className="gp-header-text">
            <div className="gp-property-name">{props.propertyName}</div>
            {props.location ? <div className="gp-property-loc">{props.location}</div> : null}
          </div>
          <div className="gp-header-actions">
            <button type="button" className="gp-icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              {theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            </button>
          </div>
        </header>

        <main className="gp-main">
          <div className="gp-wf-header">
            <Link href={`/g/${props.slug}`} className="gp-back">
              <ArrowLeft size={16} aria-hidden /> Portal
            </Link>
          </div>

          <h1 className="gp-step-title" style={{ marginTop: 0 }}>Local Guide</h1>
          <p className="gp-step-sub">
            Restaurants, cafes, parks, golf and more near {props.propertyName} — with your host&apos;s own picks first.
          </p>

          {props.places.length === 0 ? (
            <div className="gp-empty">
              <MapPin size={28} aria-hidden style={{ opacity: 0.5, marginBottom: 10 }} />
              <div>No local places are listed for this stay yet.</div>
              <div style={{ marginTop: 6, fontSize: '.85rem' }}>
                Ask the concierge in the portal chat — it can recommend area spots and ping your host for their favorites.
              </div>
            </div>
          ) : (
            <>
              <div className="gp-picker-search" style={{ position: 'relative', marginTop: 4 }}>
                <Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }} />
                <input
                  className="gp-input"
                  style={{ paddingLeft: 34 }}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search places, notes, addresses…"
                  aria-label="Search local places"
                />
              </div>

              <div className="gp-filter-bar" role="group" aria-label="Filter by category">
                <button
                  type="button"
                  className={`gp-filter-chip ${category === 'all' ? 'gp-filter-chip-on' : ''}`}
                  onClick={() => setCategory('all')}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`gp-filter-chip ${category === cat ? 'gp-filter-chip-on' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {categoryPlural(cat)}
                  </button>
                ))}
              </div>

              {favorites.length > 0 && (
                <>
                  <h2 className="gp-section-title">Host picks</h2>
                  {favorites.map((place) => (
                    <PlaceCard key={place.id} place={place} />
                  ))}
                </>
              )}

              <h2 className="gp-section-title">{filtering ? 'Matching places' : favorites.length > 0 ? 'More nearby' : 'All places'}</h2>
              {rest.length === 0 ? (
                <p className="gp-muted">No places match your search.</p>
              ) : (
                rest.map((place) => <PlaceCard key={place.id} place={place} />)
              )}
            </>
          )}
        </main>

        <footer className="gp-footer">Powered by Moche AI</footer>
      </div>
    </div>
  );
}
