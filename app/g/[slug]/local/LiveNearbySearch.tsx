'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Globe, MapPin, Navigation, Search } from 'lucide-react';
import { formatDistance } from '@/lib/local/distance';
import { safeWebsite, validCoordinates } from '@/lib/local/validation';

interface LivePlace {
  key: string; name: string; category: string | null; address: string | null;
  lat: number; lng: number; distanceMeters: number | null;
  websiteUrl: string | null; telHref: string | null;
}
interface LiveResponse { places: LivePlace[]; checkedAt: string; error?: string }
const SHORTCUTS = ['coffee', 'groceries', 'pharmacy', 'parks'];

export function LiveNearbySearch({ slug }: { slug: string }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<LivePlace[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function run(text: string) {
    const term = text.trim();
    if (term.length < 2 || term.length > 80) { setError('Enter 2–80 characters to search.'); return; }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(null); setPlaces(null); setCheckedAt(null);
    try {
      const response = await fetch(`/api/guest/${encodeURIComponent(slug)}/local/search?q=${encodeURIComponent(term)}`, {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      const data = await response.json() as LiveResponse;
      if (!response.ok) throw new Error(data.error || 'Nearby search is unavailable.');
      if (!controller.signal.aborted) { setPlaces(data.places); setCheckedAt(data.checkedAt); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Nearby search is unavailable.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run(query); }
  return (
    <section aria-label="Explore nearby with Mapbox">
      <p className="gp-step-sub">Find more places near your stay. These live Mapbox results are not recommendations from your host; details can change.</p>
      <form onSubmit={submit} className="gp-picker-search" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <label htmlFor="guest-local-live-query" className="sr-only">Search nearby places</label>
        <input id="guest-local-live-query" className="gp-input" type="search" value={query} maxLength={80}
          onChange={(event) => { pending.current?.abort(); setLoading(false); setQuery(event.target.value); setPlaces(null); setCheckedAt(null); setError(null); }}
          placeholder="Coffee, groceries, pharmacy…" style={{ flex: '1 1 200px' }} />
        <button type="submit" className="gp-filter-chip" disabled={loading} style={{ minHeight: 44 }}><Search size={15} aria-hidden /> Search</button>
      </form>
      <div className="gp-filter-bar" role="group" aria-label="Popular nearby searches">
        {SHORTCUTS.map((term) => <button key={term} type="button" className="gp-filter-chip" style={{ minHeight: 44 }}
          onClick={() => { setQuery(term); void run(term); }}>{term.charAt(0).toUpperCase() + term.slice(1)}</button>)}
      </div>
      {loading && <p className="gp-muted" role="status">Searching nearby places…</p>}
      {error && <p className="gp-empty" role="alert">{error} Your host guide is still available.</p>}
      {places && <div aria-live="polite">
        <h2 className="gp-section-title">Nearby on Mapbox</h2>
        {places.length === 0 && <p className="gp-muted">No nearby matches. Try another search or return to the host guide.</p>}
        {places.map((place) => {
          const website = safeWebsite(place.websiteUrl);
          const directions = validCoordinates(place.lat, place.lng)
            ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}` : null;
          return <article key={place.key} className="gp-place-card">
            <span className="gp-place-icon" aria-hidden><MapPin size={18} /></span>
            <div className="gp-place-body">
              <div className="gp-place-title">{place.name}<span className="gp-badge">Mapbox · not a host pick</span></div>
              <div className="gp-place-meta">{place.category?.replace(/_/g, ' ') || 'Place'}{place.distanceMeters != null ? ` · ${formatDistance(place.distanceMeters)}` : ''}</div>
              {place.address && <p className="gp-place-addr">{place.address}</p>}
              <div className="gp-place-actions">
                {directions && <a className="gp-place-link" href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={13} aria-hidden /> Directions</a>}
                {website && <a className="gp-place-link" href={website} target="_blank" rel="noopener noreferrer"><Globe size={13} aria-hidden /> Website</a>}
                {place.telHref?.match(/^tel:\+?\d{7,15}$/) && <a className="gp-place-link" href={place.telHref}>Call</a>}
              </div>
            </div>
          </article>;
        })}
        {checkedAt && <p className="gp-muted" style={{ fontSize: '.8rem' }}>Checked {new Date(checkedAt).toLocaleTimeString()}. Check with the venue before relying on hours or availability.</p>}
        <p className="gp-muted" style={{ fontSize: '.8rem' }}>Place information via <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox and its suppliers</a>. Results are temporary and are not saved to your host guide.</p>
      </div>}
    </section>
  );
}
