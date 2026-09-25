'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Beer, Coffee, Croissant, Flag, Fuel, Globe, HeartPulse, Landmark, MapPin, Moon, Navigation, Phone, Pill, Search, ShoppingBasket, Star, Store, Sun, Trees, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { NEARBY_CATEGORY_LABEL, NEARBY_CATEGORY_LABEL_PLURAL } from '@/lib/local/categories';
import { formatDistance } from '@/lib/local/distance';
import type { GuestLocalPlace } from '@/lib/local/canonical';
import { portalT } from '@/lib/guest/portal-strings';
import { PORTAL_CSS, usePortalTheme } from '../portalStyles';
import { safeWebsite, safePhone, validCoordinates } from '@/lib/local/validation';

const INITIAL_RESULTS = 8;
const CATEGORY_ICON: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed, cafe: Coffee, bar: Beer, grocery: ShoppingBasket,
  pharmacy: Pill, hospital: HeartPulse, tourist_attraction: Landmark, golf_course: Flag,
  convenience_store: Store, bakery: Croissant, park: Trees, gas_station: Fuel,
};
function categoryLabel(category: string): string {
  return NEARBY_CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}
function categoryPlural(category: string): string {
  return NEARBY_CATEGORY_LABEL_PLURAL[category] ?? `${categoryLabel(category)}s`;
}
function directionsUrl(place: GuestLocalPlace): string {
  if (validCoordinates(place.lat, place.lng)) return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(' '))}`;
}
function distanceLabel(place: GuestLocalPlace): string | null {
  return typeof place.distanceMiles === 'number' ? formatDistance(place.distanceMiles * 1609.344) : place.distanceNote;
}
function PlaceCard({ place, t }: { place: GuestLocalPlace; t: ReturnType<typeof portalT> }) {
  const Icon = CATEGORY_ICON[place.category] ?? MapPin;
  const distance = distanceLabel(place);
  const website = safeWebsite(place.website);
  const phone = safePhone(place.phone);
  return (
    <article className="gp-place-card">
      <span className="gp-place-icon" aria-hidden><Icon size={18} /></span>
      <div className="gp-place-body">
        <div className="gp-place-title">{place.name}{place.isFavorite ? <span className="gp-badge gp-badge-pick">{t('lgHostPick')}</span> : null}</div>
        <div className="gp-place-meta">
          <span>{categoryLabel(place.category)}</span>
          {distance ? <span>· {distance}</span> : null}
          {typeof place.rating === 'number' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>· <Star size={12} aria-hidden /> {place.rating.toFixed(1)}</span> : null}
        </div>
        {place.hostNote ? <p className="gp-place-note"><strong>{t('lgHostNote')}</strong> {place.hostNote}</p> : null}
        {place.detail ? <p className="gp-place-note">{place.detail}</p> : null}
        {place.address ? <p className="gp-place-addr">{place.address}</p> : null}
        <div className="gp-place-actions">
          <a className="gp-place-link" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation size={13} aria-hidden /> {t('lgDirections')}</a>
          {website ? <a className="gp-place-link" href={website} target="_blank" rel="noopener noreferrer"><Globe size={13} aria-hidden /> {t('lgWebsite')}</a> : null}
          {phone ? <a className="gp-place-link" href={phone}><Phone size={13} aria-hidden /> {t('lgCall')}</a> : null}
        </div>
      </div>
    </article>
  );
}

export function LocalGuide(props: {
  fontClassName: string; slug: string; propertyName: string; location: string;
  brandPrimary: string | null; brandAccent: string | null; logoUrl: string | null;
  places: GuestLocalPlace[]; loadError?: boolean;
}) {
  const { theme, toggleTheme } = usePortalTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [language, setLanguage] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('gp-lang');
      if (stored) { setLanguage(stored); return; }
      if (window.navigator.language) setLanguage(window.navigator.language);
    } catch { /* Browser storage may be unavailable. */ }
  }, []);
  const t = useMemo(() => portalT(language), [language]);
  const brandVars = { '--gp-primary': props.brandPrimary ?? '#33E6D4', '--gp-accent': props.brandAccent ?? '#FF8A5C' } as CSSProperties;
  const categories = useMemo(() => Array.from(new Set(props.places.map((p) => p.category)))
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [props.places]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.places.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      return !q || [p.name, p.address, p.hostNote, p.detail, p.category, categoryLabel(p.category), categoryPlural(p.category)]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [props.places, query, category]);
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_RESULTS);
  const filtering = category !== 'all' || query.trim().length > 0;
  const favorites = filtering ? [] : visible.filter((p) => p.isFavorite);
  const rest = filtering ? visible : visible.filter((p) => !p.isFavorite);
  const remaining = filtered.length - visible.length;
  const themeLabel = t(theme === 'dark' ? 'themeToLight' : 'themeToDark');
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
          <div className="gp-header-text"><div className="gp-property-name">{props.propertyName}</div>{props.location ? <div className="gp-property-loc">{props.location}</div> : null}</div>
          <div className="gp-header-actions"><button type="button" className="gp-icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>{theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}</button></div>
        </header>
        <main className="gp-main">
          <div className="gp-wf-header"><Link href={`/g/${props.slug}`} className="gp-back"><ArrowLeft size={16} aria-hidden /> {t('lgBack')}</Link></div>
          <h1 className="gp-step-title" style={{ marginTop: 0 }}>{t('lgTitle')}</h1>
          <p className="gp-step-sub">{t('lgSub', { property: props.propertyName })}</p>
          {props.loadError && <div role="alert" className="gp-empty">Local recommendations could not be loaded. Please try again in a moment or ask your host.</div>}
          {props.loadError ? null : props.places.length === 0 ? (
            <div className="gp-empty"><MapPin size={28} aria-hidden style={{ opacity: 0.5, marginBottom: 10 }} /><div>{t('lgEmpty')}</div><div style={{ marginTop: 6, fontSize: '.85rem' }}>{t('lgEmptyHint')}</div></div>
          ) : (
            <>
              <div className="gp-picker-search" style={{ position: 'relative', marginTop: 4 }}>
                <Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }} />
                <input className="gp-input" style={{ paddingLeft: 34 }} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} placeholder={t('lgSearch')} aria-label={t('lgSearch')} />
              </div>
              <div className="gp-filter-bar" role="group" aria-label={t('lgAllPlaces')}>
                <button type="button" className={`gp-filter-chip ${category === 'all' ? 'gp-filter-chip-on' : ''}`} onClick={() => { setCategory('all'); setShowAll(false); }} aria-pressed={category === 'all'}>{t('lgAll')}</button>
                {categories.map((cat) => <button key={cat} type="button" className={`gp-filter-chip ${category === cat ? 'gp-filter-chip-on' : ''}`} onClick={() => { setCategory(cat); setShowAll(false); }} aria-pressed={category === cat}>{categoryPlural(cat)}</button>)}
              </div>
              {favorites.length > 0 && <><h2 className="gp-section-title">{t('lgHostPicks')}</h2>{favorites.map((place) => <PlaceCard key={place.id} place={place} t={t} />)}</>}
              {(filtering || rest.length > 0) && <h2 className="gp-section-title">{filtering ? t('lgMatching') : favorites.length > 0 ? t('lgMore') : t('lgAllPlaces')}</h2>}
              {rest.length === 0 && filtering ? <p className="gp-muted">{t('lgNoMatch')}</p> : rest.map((place) => <PlaceCard key={place.id} place={place} t={t} />)}
              {remaining > 0 && <button type="button" className="gp-filter-chip" style={{ minHeight: 44, marginTop: '.75rem' }} onClick={() => setShowAll(true)} aria-label={`Show ${remaining} more places`}>{t('lgMore')} ({remaining})</button>}
            </>
          )}
        </main>
        <footer className="gp-footer">{t('poweredBy')} · Place data may include <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</footer>
      </div>
    </div>
  );
}
