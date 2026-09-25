'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Heart, MapPin, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { refreshLocalPlacesAction, type LocalRefreshState } from './actions';
import { LocalPlaceForm, type PickedLocation } from './LocalPlaceForm';
import { localCategoryLabel } from '@/lib/local/merge';
import type { LocalPlaceRow } from '@/lib/local/canonical';
export type { LocalPlaceRow } from '@/lib/local/canonical';

type PlaceTab = LocalPlaceRow['status'];
const TABS: { value: PlaceTab; label: string }[] = [
  { value: 'approved', label: 'Visible to guests' },
  { value: 'suggested', label: 'Needs review' },
  { value: 'hidden', label: 'Hidden' },
];

function RefreshButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-sm" disabled={pending} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: '.4rem' }} data-testid="local-refresh">
    <RefreshCw size={14} className={pending ? 'spin' : undefined} aria-hidden /> {pending ? 'Refreshing…' : 'Find nearby suggestions'}
  </button>;
}

interface EditorProps {
  propertyId: string;
  pickedLocation?: PickedLocation | null;
  onPickLocation?: (target: string) => void;
  selectedId?: string | null;
}

function PlaceEditor({ propertyId, place, pickedLocation, onPickLocation, selectedId }: EditorProps & { place: LocalPlaceRow }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (selectedId === place.recommendationId) setEditing(true); }, [selectedId, place.recommendationId]);
  return (
    <article className="card" tabIndex={-1} style={{ marginBottom: '.75rem', padding: '1rem', scrollMarginTop: '1rem', overflowWrap: 'anywhere' }} id={`place-${place.recommendationId}`}>
      <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {place.isFavorite && <Heart size={14} aria-hidden fill="currentColor" />}
            {place.name}<span className="badge" style={{ fontSize: '.68rem' }}>{place.status === 'approved' ? 'Guest-visible' : place.status === 'hidden' ? 'Hidden' : 'Awaiting review'}</span>
          </div>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: '.18rem' }}>{localCategoryLabel(place.category)}{place.distanceMiles != null ? ` · ${place.distanceMiles.toFixed(1)} mi` : ''}</div>
          {place.address && <div className="faint" style={{ fontSize: '.8rem', marginTop: '.18rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}><MapPin size={12} aria-hidden style={{ flexShrink: 0 }} /> {place.address}</div>}
          {place.hostNote && <p className="muted" style={{ fontSize: '.85rem', margin: '.45rem 0 0' }}>Your tip: {place.hostNote}</p>}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setEditing((value) => !value)} aria-expanded={editing} aria-label={`${editing ? 'Close editor for' : 'Edit details for'} ${place.name}`} style={{ minHeight: 44 }}>
          <Pencil size={14} aria-hidden /> {editing ? 'Close' : 'Edit place & tip'}
        </button>
      </div>
      {editing && <LocalPlaceForm propertyId={propertyId} place={place} pickedLocation={pickedLocation} onPickLocation={onPickLocation} />}
    </article>
  );
}

export function LocalPlaceManager({ propertyId, places, canEdit, pickedLocation, onPickLocation, selectedId, manualRequest = 0 }: EditorProps & {
  places: LocalPlaceRow[]; canEdit: boolean; manualRequest?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<PlaceTab>(places.some((place) => place.status === 'suggested') ? 'suggested' : 'approved');
  const [query, setQuery] = useState('');
  const [refreshState, refreshAction] = useFormState<LocalRefreshState, FormData>(refreshLocalPlacesAction, {});
  useEffect(() => { if (manualRequest) setAdding(true); }, [manualRequest]);
  useEffect(() => { if (adding) document.getElementById('local-form-new-name')?.focus(); }, [adding]);
  useEffect(() => {
    const selected = places.find((place) => place.recommendationId === selectedId);
    if (selected) { setTab(selected.status); setQuery(''); }
  }, [selectedId, places]);
  const counts = useMemo(() => ({
    approved: places.filter((place) => place.status === 'approved').length,
    suggested: places.filter((place) => place.status === 'suggested').length,
    hidden: places.filter((place) => place.status === 'hidden').length,
  }), [places]);
  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return places.filter((place) => place.status === tab && (!term ||
      [place.name, place.category, place.address, place.hostNote].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name));
  }, [places, tab, query]);
  if (!canEdit) return null;
  return (
    <section style={{ marginTop: '1.25rem' }} aria-label="Manage local places">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Manage places</h2>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <form action={refreshAction} style={{ display: 'inline-flex', margin: 0 }}><input type="hidden" name="propertyId" value={propertyId} /><RefreshButton /></form>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding((value) => !value)} aria-expanded={adding} style={{ minHeight: 44 }}>
            {adding ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />} {adding ? 'Close form' : 'Add your own place'}
          </button>
        </div>
      </div>
      <div aria-live="polite">
        {refreshState.error && <p role="alert" className="alert alert-error" style={{ fontSize: '.82rem' }}>{refreshState.error}</p>}
        {refreshState.ok && <p role="status" className="alert alert-success" style={{ fontSize: '.82rem' }}>{refreshState.found === 0 ? 'No nearby places found.' : `Checked ${refreshState.found} nearby places. Review new suggestions before sharing with guests.`}</p>}
      </div>
      {adding && <div className="card" style={{ marginBottom: '.75rem', padding: '1rem' }}><LocalPlaceForm propertyId={propertyId} pickedLocation={pickedLocation} onPickLocation={onPickLocation} /></div>}
      <div role="group" aria-label="Place visibility" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        {TABS.map(({ value, label }) => <button key={value} type="button" className={`btn btn-sm ${tab === value ? 'btn-primary' : ''}`} style={{ minHeight: 44 }} aria-pressed={tab === value} onClick={() => { setTab(value); setQuery(''); }}>{label} ({counts[value]})</button>)}
      </div>
      <label className="label" htmlFor="local-place-search">Search {TABS.find(({ value }) => value === tab)?.label.toLowerCase()}</label>
      <div style={{ position: 'relative', marginBottom: '.85rem' }}><Search size={16} aria-hidden style={{ position: 'absolute', top: 12, left: 12 }} /><input id="local-place-search" className="input" type="search" style={{ paddingLeft: 36 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places or host tips" /></div>
      <div aria-live="polite">
        {shown.map((place) => <PlaceEditor key={place.recommendationId} propertyId={propertyId} place={place} selectedId={selectedId} pickedLocation={pickedLocation} onPickLocation={onPickLocation} />)}
        {shown.length === 0 && <div className="card muted" style={{ fontSize: '.9rem' }}>{query ? 'No places match this search.' : tab === 'suggested' ? 'Nothing needs review right now.' : tab === 'hidden' ? 'No hidden places.' : 'No guest-visible places yet. Review a suggestion or add your own place.'}</div>}
      </div>
      {places.some((place) => place.provider === 'osm') && <p className="faint" style={{ fontSize: '.75rem' }}>Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</p>}
    </section>
  );
}
