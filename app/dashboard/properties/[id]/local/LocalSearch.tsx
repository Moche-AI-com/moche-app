'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, MapPin, Star } from 'lucide-react';
import { formatDistanceApprox } from '@/lib/local/distance';
import type { LocalSearchResult } from '@/lib/local/search';
import { validCoordinates } from '@/lib/local/validation';

interface SearchResponse {
  results?: LocalSearchResult[];
  source?: 'local' | 'hybrid';
  usedFallback?: boolean;
  fallbackSkipped?: string;
  error?: string;
  providerFailed?: boolean;
}

/**
 * Hybrid Local search (backlog P4-13), host side.
 *
 * Types a query, hits the property-scoped search route, and renders results with a
 * source badge on every row. The route decides whether the map provider is
 * consulted; this component only reports what came back, so the local-first rule
 * lives in exactly one place.
 */
export function LocalSearch({ propertyId, onSelect, onClear, onAddManual }: {
  propertyId: string;
  onSelect?: (result: LocalSearchResult) => void;
  onClear?: () => void;
  onAddManual?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<LocalSearchResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++requestId.current;
    onClear?.();
    setResults([]);
    setNote(null);
    setError(null);
    if (trimmed.length < 2) {
      setState('idle');
      setResults([]);
      setNote(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setState('busy');
    // Debounced so refining a query does not fire a request per keystroke, which
    // is what would push the provider tier into real cost.
    const timer = setTimeout(async () => {
      setState('busy');
      setError(null);
      try {
        const res = await fetch(
          `/api/host/properties/${propertyId}/local/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const json = (await res.json()) as SearchResponse;
        if (controller.signal.aborted || id !== requestId.current) return;
        if (!res.ok) {
          setState('error');
          setError(json.error ?? 'Search failed. Try again.');
          return;
        }
        setResults(json.results ?? []);
        setNote(describe(json));
        setState('done');
      } catch {
        if (controller.signal.aborted || id !== requestId.current) return;
        setState('error');
        setError('Search failed. Try again.');
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, propertyId, retry, onClear]);

  return (
    <div className="card ph-no-capture" style={{ padding: 'var(--pad-card)', marginBottom: 'var(--gap-section)' }}>
      <label className="label" htmlFor="local-search">Search saved places & nearby suggestions</label>
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          aria-hidden
          style={{ position: 'absolute', left: '.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}
        />
        <input
          id="local-search"
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Coffee, pharmacy, a place by name…"
          autoComplete="off"
          maxLength={120}
          style={{ paddingLeft: '2.1rem', minHeight: 44 }}
        />
      </div>
      <p className="faint" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>
        Your own places come first. Map suggestions only appear when fewer than three of your
        places match.
      </p>

      <div aria-live="polite" style={{ marginTop: '.85rem' }}>
        {state === 'busy' && (
          <p className="muted" style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Loader2 size={14} className="spin" aria-hidden />
            Searching…
          </p>
        )}

        {state === 'error' && error && (
          <div role="alert" className="alert alert-error" style={{ fontSize: '.85rem' }}>{error} <button type="button" className="btn btn-sm" onClick={() => setRetry((n) => n + 1)} style={{ minHeight: 44 }}>Retry search</button></div>
        )}

        {state === 'done' && results.length === 0 && (
          <p className="muted" style={{ fontSize: '.85rem' }}>
            No matches for &ldquo;{query.trim()}&rdquo;.{note ? ` ${note}` : ''}
          </p>
        )}

        {state === 'done' && results.length > 0 && (
          <>
            {note && <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 .5rem' }}>{note}</p>}
            <ul className="report-list" style={{ margin: 0 }}>
              {results.map((r) => (
                <li key={r.id} className="report-list-row">
                  <div
                    className="report-list-title"
                    style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}
                  >
                    {r.favorite && <Star size={14} aria-hidden style={{ flexShrink: 0 }} />}
                    <span>{r.name}</span>
                    <span className={r.inLibrary ? 'badge badge-teal' : 'badge'} style={{ fontSize: '.68rem' }}>
                      {r.sourceLabel}
                    </span>
                  </div>
                  <div className="report-list-meta">
                    {r.categoryLabel}
                    {r.distanceMeters !== null ? ` · ${formatDistanceApprox(r.distanceMeters)}` : ''}
                    {r.rating !== null ? ` · ${r.rating.toFixed(1)}★` : ''}
                  </div>
                  {r.detail && (
                    <div className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>{r.detail}</div>
                  )}
                  {r.address && (
                    <div className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      <MapPin size={12} aria-hidden />
                      {r.address}
                    </div>
                  )}
                  {!r.inLibrary && (
                    <div className="faint" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
                      Temporary Mapbox suggestion. Not saved or shared with guests. Add your own details manually.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
                    {(r.inLibrary || validCoordinates(r.lat, r.lng)) && <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => onSelect?.(r)}>{r.inLibrary ? 'Edit saved place' : 'View on map'}</button>}
                    {!r.inLibrary && onAddManual && <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={onAddManual}>Add manually</button>}
                  </div>
                </li>
              ))}
            </ul>
            {results.some((r) => r.source === 'mapbox') && <p className="faint" style={{ fontSize: '.75rem', marginBottom: 0 }}>Search data © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox and its suppliers</a>. Temporary use only.</p>}
          </>
        )}
      </div>
      {state === 'done' && results.length === 0 && onAddManual && <button type="button" className="btn btn-sm" onClick={onAddManual} style={{ minHeight: 44 }}>Add a place manually</button>}
    </div>
  );
}

function describe(json: SearchResponse): string | null {
  if (json.providerFailed) return 'Map suggestions are unavailable right now. Your saved matches are shown; try again shortly.';
  if (json.usedFallback) {
    return json.source === 'hybrid'
      ? 'Fewer than three of your places matched, so map suggestions were added.'
      : 'Fewer than three of your places matched, and the map provider returned nothing.';
  }
  switch (json.fallbackSkipped) {
    case 'no_coordinates':
      return 'Add an address in Settings to include map suggestions in this search.';
    case 'provider_unavailable':
      return 'Map suggestions are unavailable, so only your own places were searched.';
    default:
      return null;
  }
}
