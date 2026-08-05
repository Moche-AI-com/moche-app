'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, MapPin, Star } from 'lucide-react';
import { formatDistanceApprox } from '@/lib/local/distance';
import type { LocalSearchResult } from '@/lib/local/search';

interface SearchResponse {
  results?: LocalSearchResult[];
  source?: 'local' | 'hybrid';
  usedFallback?: boolean;
  fallbackSkipped?: string;
  error?: string;
}

/**
 * Hybrid Local search (backlog P4-13), host side.
 *
 * Types a query, hits the property-scoped search route, and renders results with a
 * source badge on every row. The route decides whether the map provider is
 * consulted; this component only reports what came back, so the local-first rule
 * lives in exactly one place.
 */
export function LocalSearch({ propertyId }: { propertyId: string }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<LocalSearchResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState('idle');
      setResults([]);
      setNote(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    // Debounced so refining a query does not fire a request per keystroke, which
    // is what would push the provider tier into real cost.
    const timer = setTimeout(async () => {
      setState('busy');
      setError(null);
      try {
        const res = await fetch(
          `/api/host/properties/${propertyId}/local/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as SearchResponse;
        if (id !== requestId.current) return;
        if (!res.ok) {
          setState('error');
          setError(json.error ?? 'Search failed. Try again.');
          return;
        }
        setResults(json.results ?? []);
        setNote(describe(json));
        setState('done');
      } catch (e) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setState('error');
        setError('Search failed. Try again.');
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, propertyId]);

  return (
    <div className="card" style={{ padding: 'var(--pad-card)', marginBottom: 'var(--gap-section)' }}>
      <label className="label" htmlFor="local-search">Search this property&apos;s local list</label>
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
          <div className="alert alert-error" style={{ fontSize: '.85rem' }}>{error}</div>
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
                    {r.distanceMeters !== null ? formatDistanceApprox(r.distanceMeters) : ''}
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
                      Not in your list yet. Add it from Recommendations to share it with guests.
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function describe(json: SearchResponse): string | null {
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
