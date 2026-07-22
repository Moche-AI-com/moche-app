'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

interface Suggestion {
  key: string;
  label: string;
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
}

// Ids of the existing form fields to auto-populate on selection. Any omitted /
// missing field is simply skipped, so this works on both the create and edit forms.
export interface AddressFieldTargets {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string; // populated with the full country NAME (Photon `country`)
}

function setField(id: string | undefined, value: string) {
  if (!id) return;
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) el.value = value;
}

// Free, keyless address autocomplete backed by Photon (via /api/geo/autocomplete).
// Debounced 300ms, max 5 suggestions. On selection it fills the sibling address
// fields and captures lat/lng in hidden inputs the parent form submits.
export function AddressAutocomplete({
  targets,
  initialLat = null,
  initialLng = null,
  initialQuery = '',
}: {
  targets: AddressFieldTargets;
  initialLat?: number | null;
  initialLng?: number | null;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState<string>(initialLat != null ? String(initialLat) : '');
  const [lng, setLng] = useState<string>(initialLng != null ? String(initialLng) : '');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (manual) return;
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { suggestions?: Suggestion[] };
        setSuggestions(json.suggestions ?? []);
        setOpen((json.suggestions ?? []).length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, manual]);

  function choose(s: Suggestion) {
    setField(targets.line1, s.line1 ?? '');
    if (s.city) setField(targets.city, s.city);
    if (s.state) setField(targets.state, s.state);
    if (s.postalCode) setField(targets.postalCode, s.postalCode);
    if (s.country) setField(targets.country, s.country);
    setLat(String(s.lat));
    setLng(String(s.lng));
    setQuery(s.line1 ?? s.label);
    setOpen(false);
  }

  return (
    <div className="field" ref={boxRef} style={{ position: 'relative' }}>
      <label className="label" htmlFor="addressSearch">Address</label>

      {!manual ? (
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            id="addressSearch"
            data-testid="address-autocomplete-input"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Start typing an address…"
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--muted, #888)' }}>
            {loading ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}
          </span>
          {open && suggestions.length > 0 && (
            <ul
              data-testid="address-suggestions"
              style={{
                position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
                listStyle: 'none', margin: 0, padding: '.25rem', background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #ddd)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,.12)',
                maxHeight: 260, overflowY: 'auto',
              }}
            >
              {suggestions.map((s, i) => (
                <li key={s.key || i}>
                  <button
                    type="button"
                    data-testid={`address-suggestion-${i}`}
                    onClick={() => choose(s)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '.5rem .6rem', border: 'none',
                      background: 'transparent', cursor: 'pointer', borderRadius: 6, fontSize: '.85rem',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2, #f4f4f5)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="latManual" style={{ fontSize: '.75rem' }}>Latitude</label>
            <input
              className="input" id="latManual" data-testid="manual-lat" inputMode="decimal"
              value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.3874"
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="lngManual" style={{ fontSize: '.75rem' }}>Longitude</label>
            <input
              className="input" id="lngManual" data-testid="manual-lng" inputMode="decimal"
              value={lng} onChange={(e) => setLng(e.target.value)} placeholder="2.1686"
            />
          </div>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.5rem', fontSize: '.8rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          data-testid="manual-pin-toggle"
          checked={manual}
          onChange={(e) => setManual(e.target.checked)}
          style={{ accentColor: 'var(--teal)' }}
        />
        No address yet — set the pin manually
      </label>
      {(lat || lng) && !manual && (
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.35rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <MapPin size={12} /> Pinned at {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
          <button
            type="button"
            onClick={() => { setLat(''); setLng(''); }}
            title="Clear pin"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted,#888)', display: 'inline-flex' }}
          >
            <X size={12} />
          </button>
        </p>
      )}

      {/* Submitted with the parent form. */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
    </div>
  );
}
