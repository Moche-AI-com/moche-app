'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X, Check, AlertCircle } from 'lucide-react';
import StaticMapPreview from '@/components/StaticMapPreview';

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
  country?: string; // populated with the full country NAME
}

function setField(id: string | undefined, value: string) {
  if (!id) return;
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  el.value = value;
  // Notify any controlled/React listeners bound to the target field.
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// Address autocomplete backed by /api/geo/autocomplete (Mapbox Geocoding v6 when
// a server token is configured, free Photon/OSM otherwise — the browser never
// sees either token). Debounced 300ms, max 5 suggestions, full keyboard support.
// On selection it fills the sibling address fields, captures lat/lng in hidden
// inputs the parent form submits, and shows a map preview so the host can
// visually confirm the pin before saving.
export function AddressAutocomplete({
  targets,
  initialLat = null,
  initialLng = null,
  initialQuery = '',
  showMap = true,
}: {
  targets: AddressFieldTargets;
  initialLat?: number | null;
  initialLng?: number | null;
  initialQuery?: string;
  showMap?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [active, setActive] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(initialLat != null && initialLng != null);
  const [lat, setLat] = useState<string>(initialLat != null ? String(initialLat) : '');
  const [lng, setLng] = useState<string>(initialLng != null ? String(initialLng) : '');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      setNotice(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // Cancel any still-pending lookup so only the newest query counts against
      // the rate limit and the newest response wins.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setNotice(null);
      try {
        const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.status === 429) {
          setSuggestions([]);
          setOpen(false);
          setNotice('Too many lookups right now — pause a moment, or set the pin manually.');
          return;
        }
        const json = (await res.json()) as { suggestions?: Suggestion[] };
        const hits = json.suggestions ?? [];
        setSuggestions(hits);
        setActive(-1);
        setOpen(hits.length > 0);
        if (hits.length === 0) setNotice('No matches. Try a simpler search, or set the pin manually.');
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setSuggestions([]);
        setNotice('Address lookup is unavailable right now — you can set the pin manually.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
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
    setConfirmed(true);
    setNotice(null);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const latNum = lat.trim() === '' ? null : Number(lat);
  const lngNum = lng.trim() === '' ? null : Number(lng);
  const hasPin = latNum != null && lngNum != null && Number.isFinite(latNum) && Number.isFinite(lngNum);

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
            role="combobox"
            aria-expanded={open}
            aria-controls="address-suggestion-list"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `address-option-${active}` : undefined}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setConfirmed(false); }}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Start typing an address…"
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: confirmed ? 'var(--teal)' : 'var(--text-faint, #888)' }}>
            {loading ? <Loader2 size={16} className="spin" /> : confirmed ? <Check size={16} /> : <MapPin size={16} />}
          </span>
          {open && suggestions.length > 0 && (
            <ul
              id="address-suggestion-list"
              role="listbox"
              data-testid="address-suggestions"
              style={{
                position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
                listStyle: 'none', margin: 0, padding: '.25rem', background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #ddd)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,.12)',
                maxHeight: 260, overflowY: 'auto',
              }}
            >
              {suggestions.map((s, i) => (
                <li key={s.key || i} role="none">
                  <button
                    type="button"
                    id={`address-option-${i}`}
                    role="option"
                    aria-selected={active === i}
                    data-testid={`address-suggestion-${i}`}
                    onClick={() => choose(s)}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '.5rem .6rem', border: 'none',
                      background: active === i ? 'var(--surface-2, #f4f4f5)' : 'transparent',
                      cursor: 'pointer', borderRadius: 6, fontSize: '.85rem',
                      display: 'flex', alignItems: 'center', gap: '.45rem',
                    }}
                  >
                    <MapPin size={13} style={{ flexShrink: 0, color: 'var(--text-faint, #999)' }} aria-hidden />
                    <span>{s.label}</span>
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

      {notice && (
        <p
          role="status"
          className="faint"
          style={{ fontSize: '.75rem', marginTop: '.4rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}
        >
          <AlertCircle size={12} aria-hidden /> {notice}
        </p>
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

      {hasPin && (
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.35rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <MapPin size={12} aria-hidden /> Pinned at {latNum!.toFixed(5)}, {lngNum!.toFixed(5)}
          <button
            type="button"
            onClick={() => { setLat(''); setLng(''); setConfirmed(false); }}
            title="Clear pin"
            aria-label="Clear pin"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint,#888)', display: 'inline-flex' }}
          >
            <X size={12} />
          </button>
        </p>
      )}

      {showMap && (
        <StaticMapPreview
          lat={latNum}
          lng={lngNum}
          height={170}
          width={800}
          zoom={15}
          className="address-map-preview"
          caption={hasPin ? 'Guests see directions from this pin — check it looks right.' : undefined}
          emptyHint="Pick a suggestion (or set a pin) to preview the location."
        />
      )}

      {/* Submitted with the parent form. */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
    </div>
  );
}
