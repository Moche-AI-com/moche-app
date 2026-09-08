'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Check, MapPin } from 'lucide-react';
import { addManualLocalPlaceAction, updateLocalPlaceAction, type LocalSaveState } from './actions';
import type { LocalPlaceRow } from '@/lib/local/canonical';

export interface PickedLocation { target: string; lat: number; lng: number }

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary btn-sm" type="submit" disabled={pending} style={{ minHeight: 44, marginTop: '.85rem' }}>
    <Check size={14} aria-hidden /> {pending ? 'Saving…' : editing ? 'Save place' : 'Add place'}
  </button>;
}

export function LocalPlaceForm({ propertyId, place, pickedLocation, onPickLocation }: {
  propertyId: string;
  place?: LocalPlaceRow;
  pickedLocation?: PickedLocation | null;
  onPickLocation?: (target: string) => void;
}) {
  const target = place?.recommendationId ?? 'new';
  const prefix = `local-form-${target}`;
  const [state, action] = useFormState<LocalSaveState, FormData>(place ? updateLocalPlaceAction : addManualLocalPlaceAction, {});
  // React resets uncontrolled form fields when a server action resolves, even
  // when it returns a validation error. Keep the draft until the host closes it.
  const [draft, setDraft] = useState({
    name: place?.name ?? '', address: place?.address ?? '', category: place?.category ?? 'attraction',
    website: place?.website ?? '', phone: place?.phone ?? '', hostNote: place?.hostNote ?? '',
    tags: place?.tags.join(', ') ?? '', intentTags: place?.intentTags.join(', ') ?? '',
    isFavorite: place?.isFavorite ?? false, status: place?.status ?? 'approved',
  });
  const [lat, setLat] = useState(place?.lat?.toString() ?? '');
  const [lng, setLng] = useState(place?.lng?.toString() ?? '');
  useEffect(() => {
    if (pickedLocation?.target !== target) return;
    setLat(pickedLocation.lat.toFixed(6));
    setLng(pickedLocation.lng.toFixed(6));
    document.getElementById(`${prefix}-lat`)?.focus({ preventScroll: true });
  }, [pickedLocation, target, prefix]);

  const text = (name: 'name' | 'address' | 'category' | 'website' | 'phone' | 'tags' | 'intentTags', label: string, maxLength: number, type = 'text') => (
    <div style={{ marginTop: '.7rem' }}>
      <label className="label" htmlFor={`${prefix}-${name}`}>{label}</label>
      <input id={`${prefix}-${name}`} name={name} className="input" value={draft[name]} onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))} maxLength={maxLength} type={type} required={name === 'name' || name === 'category'} />
    </div>
  );
  return (
    <form action={action} onReset={(event) => event.preventDefault()} className="ph-no-capture" style={{ borderTop: place ? '1px solid var(--border)' : undefined, marginTop: '.9rem', paddingTop: place ? '.3rem' : 0 }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      {place && <input type="hidden" name="recommendationId" value={place.recommendationId} />}
      {!place && <p className="muted" style={{ fontSize: '.82rem' }}>Add your own place details. Mapbox suggestions are temporary and are not copied into this form.</p>}
      {text('name', 'Place name', 160)}
      {text('address', 'Address', 500)}
      {text('category', 'Category', 80)}
      {text('website', 'Website (optional)', 1000, 'url')}
      {text('phone', 'Phone (optional)', 40, 'tel')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.7rem', marginTop: '.7rem' }}>
        <div><label className="label" htmlFor={`${prefix}-lat`}>Latitude (optional)</label><input id={`${prefix}-lat`} name="lat" className="input" type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} /></div>
        <div><label className="label" htmlFor={`${prefix}-lng`}>Longitude (optional)</label><input id={`${prefix}-lng`} name="lng" className="input" type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
        {onPickLocation && <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => onPickLocation(target)}><MapPin size={14} aria-hidden /> Choose on map</button>}
        {(lat || lng) && <button type="button" className="btn btn-sm" style={{ minHeight: 44 }} onClick={() => { setLat(''); setLng(''); }}>Clear coordinates</button>}
      </div>
      <p className="faint" style={{ fontSize: '.78rem' }}>Use both coordinates for an exact pin, or leave both blank to use the address for directions.</p>
      <label className="label" htmlFor={`${prefix}-note`}>Host note · shared with guests</label>
      <textarea id={`${prefix}-note`} name="hostNote" className="input" value={draft.hostNote} onChange={(e) => setDraft((d) => ({ ...d, hostNote: e.target.value }))} maxLength={500} rows={3} />
      {text('tags', 'Tags (comma separated)', 500)}
      {text('intentTags', 'Guest intent tags (comma separated)', 500)}
      <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.75rem' }}>
        <label><input name="isFavorite" type="checkbox" value="true" checked={draft.isFavorite} onChange={(e) => setDraft((d) => ({ ...d, isFavorite: e.target.checked }))} /> Favorite</label>
        <div><label className="label" htmlFor={`${prefix}-status`}>Guest visibility</label><select id={`${prefix}-status`} name="status" className="input" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as typeof d.status }))}>
          <option value="approved">Recommended · guests can see</option><option value="suggested">Suggestion · only hosts</option><option value="hidden">Hidden · only hosts</option>
        </select></div>
      </div>
      <div aria-live="polite">
        {state.error && <p role="alert" className="alert alert-error" style={{ marginTop: '.75rem' }}>{state.error}</p>}
        {state.ok && <p role="status" className="alert alert-success" style={{ marginTop: '.75rem' }}>{state.message}</p>}
      </div>
      <Submit editing={!!place} />
    </form>
  );
}
