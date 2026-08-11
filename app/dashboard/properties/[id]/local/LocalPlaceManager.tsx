'use client';

import { useState } from 'react';
import { Check, EyeOff, Heart, MapPin, Pencil, Plus, X } from 'lucide-react';
import { addManualLocalPlaceAction, updateLocalPlaceAction } from './actions';

export interface LocalPlaceRow {
  recommendationId: string;
  name: string;
  category: string;
  address: string | null;
  status: 'suggested' | 'approved' | 'hidden';
  hostNote: string | null;
  tags: string[];
  intentTags: string[];
  isFavorite: boolean;
  distanceMiles: number | null;
  lastRefreshedAt: string | null;
  provider: string;
}

function PlaceEditor({ propertyId, place }: { propertyId: string; place: LocalPlaceRow }) {
  const [editing, setEditing] = useState(false);
  const label = place.hostNote ? 'Edit note' : '+ Add note';
  return (
    <article className="card" style={{ marginBottom: '.75rem', padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, display: 'flex', gap: '.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {place.isFavorite && <Heart size={14} aria-hidden fill="currentColor" />}
            {place.name}
            <span className="badge" style={{ fontSize: '.68rem' }}>{place.status}</span>
          </div>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: '.18rem' }}>
            {place.category}{place.distanceMiles != null ? ` · ${place.distanceMiles.toFixed(1)} mi` : ''}
          </div>
          {place.address && <div className="faint" style={{ fontSize: '.8rem', marginTop: '.18rem' }}><MapPin size={12} aria-hidden /> {place.address}</div>}
          {place.hostNote && <p className="muted" style={{ fontSize: '.85rem', margin: '.45rem 0 0' }}>Your note: {place.hostNote}</p>}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setEditing((value) => !value)} style={{ minHeight: 44 }}>
          <Pencil size={14} aria-hidden /> {editing ? 'Close' : label}
        </button>
      </div>
      {editing && (
        <form action={updateLocalPlaceAction} style={{ borderTop: '1px solid var(--border)', marginTop: '.9rem', paddingTop: '.9rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="recommendationId" value={place.recommendationId} />
          <label className="label" htmlFor={`note-${place.recommendationId}`}>Host note</label>
          <textarea id={`note-${place.recommendationId}`} name="hostNote" className="input" defaultValue={place.hostNote ?? ''} maxLength={500} rows={3} />
          <label className="label" htmlFor={`tags-${place.recommendationId}`} style={{ marginTop: '.7rem' }}>Tags</label>
          <input id={`tags-${place.recommendationId}`} name="tags" className="input" defaultValue={place.tags.join(', ')} placeholder="family, rainy-day" />
          <label className="label" htmlFor={`intent-${place.recommendationId}`} style={{ marginTop: '.7rem' }}>Guest intent tags</label>
          <input id={`intent-${place.recommendationId}`} name="intentTags" className="input" defaultValue={place.intentTags.join(', ')} placeholder="dinner, outdoors" />
          <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
            <label><input name="isFavorite" type="checkbox" value="true" defaultChecked={place.isFavorite} /> Favorite</label>
            <label>Status <select name="status" className="input" defaultValue={place.status} style={{ display: 'inline-block', width: 'auto', marginLeft: '.35rem' }}><option value="approved">Recommended</option><option value="suggested">Suggestion</option><option value="hidden">Hidden</option></select></label>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" style={{ minHeight: 44, marginTop: '.85rem' }}><Check size={14} aria-hidden /> Save place</button>
        </form>
      )}
    </article>
  );
}

export function LocalPlaceManager({ propertyId, places, canEdit }: { propertyId: string; places: LocalPlaceRow[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  if (!canEdit) return null;
  return (
    <section style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Manage places</h2>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding((value) => !value)} style={{ minHeight: 44 }}>
          {adding ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />} {adding ? 'Close' : 'Add manually'}
        </button>
      </div>
      {adding && (
        <form action={addManualLocalPlaceAction} className="card" style={{ marginBottom: '.75rem', padding: '1rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <label className="label" htmlFor="manual-place-name">Place name</label><input id="manual-place-name" name="name" className="input" required maxLength={160} />
          <label className="label" htmlFor="manual-place-address" style={{ marginTop: '.7rem' }}>Address</label><input id="manual-place-address" name="address" className="input" maxLength={500} />
          <label className="label" htmlFor="manual-place-category" style={{ marginTop: '.7rem' }}>Category</label><input id="manual-place-category" name="category" className="input" defaultValue="attraction" maxLength={80} />
          <label className="label" htmlFor="manual-place-note" style={{ marginTop: '.7rem' }}>Host note</label><textarea id="manual-place-note" name="hostNote" className="input" rows={2} maxLength={500} />
          <label className="label" htmlFor="manual-place-tags" style={{ marginTop: '.7rem' }}>Tags</label><input id="manual-place-tags" name="tags" className="input" placeholder="family, favorite" />
          <label className="label" htmlFor="manual-place-intents" style={{ marginTop: '.7rem' }}>Guest intent tags</label><input id="manual-place-intents" name="intentTags" className="input" placeholder="dinner, beach" />
          <label style={{ display: 'block', marginTop: '.7rem' }}><input type="checkbox" name="isFavorite" value="true" /> Favorite</label>
          <button className="btn btn-primary btn-sm" type="submit" style={{ minHeight: 44, marginTop: '.85rem' }}><Plus size={14} aria-hidden /> Add place</button>
        </form>
      )}
      {places.map((place) => <PlaceEditor key={place.recommendationId} propertyId={propertyId} place={place} />)}
      {places.length === 0 && <div className="card muted" style={{ fontSize: '.9rem' }}><EyeOff size={16} aria-hidden /> No places in this view yet.</div>}
    </section>
  );
}
