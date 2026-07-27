'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import StaticMapPreview from '@/components/StaticMapPreview';
import {
  discoverLocalIntelAction,
  updateRecommendationAction,
  addRecommendationAction,
  deleteRecommendationAction,
  type RecActionState,
} from './actions';

interface Rec {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  url: string | null;
  distance_note: string | null;
  description: string | null;
  host_note: string | null;
  host_preference: 'loved' | 'neutral' | 'disliked' | null;
  priority_weight: number | null;
  approved: boolean;
  hidden: boolean;
  ai_source: string | null;
  lat: number | null;
  lng: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  attraction: 'Attraction',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
};

function DiscoverButton({ hasAddress }: { hasAddress: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending || !hasAddress}>
      {pending ? 'Searching nearby…' : 'Find nearby places'}
    </button>
  );
}

function RowSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost" disabled={pending} style={{ fontSize: '.8rem' }}>
      {pending ? '…' : label}
    </button>
  );
}

export function RecommendationsManager({
  propertyId,
  hasAddress,
  canEdit,
  initialRecs,
  propertyLat,
  propertyLng,
}: {
  propertyId: string;
  hasAddress: boolean;
  canEdit: boolean;
  initialRecs: Rec[];
  propertyLat?: number | null;
  propertyLng?: number | null;
}) {
  const router = useRouter();
  const [discoverState, discoverAction] = useFormState<RecActionState, FormData>(
    discoverLocalIntelAction,
    {},
  );
  const [addState, addAction] = useFormState<RecActionState, FormData>(addRecommendationAction, {});
  const [showAdd, setShowAdd] = useState(false);

  const pending = initialRecs.filter((r) => !r.approved);
  const live = initialRecs.filter((r) => r.approved && !r.hidden);
  const hidden = initialRecs.filter((r) => r.approved && r.hidden);

  return (
    <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1.5rem' }}>
      {/* Discover */}
      <section className="card" style={{ padding: '1rem' }}>
        <h3 style={{ margin: 0 }}>Auto-find places</h3>
        <p className="muted" style={{ fontSize: '.85rem', margin: '.4rem 0 .8rem' }}>
          We look up restaurants, cafes, attractions, grocery, pharmacy and hospitals near your
          property using map data. Nothing is shared with guests until you approve it.
        </p>
        {!hasAddress && (
          <p style={{ color: 'var(--danger, #c0392b)', fontSize: '.85rem' }}>
            Add the property address in Settings first.
          </p>
        )}
        <form action={discoverAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <DiscoverButton hasAddress={hasAddress && canEdit} />
        </form>
        {discoverState.error && (
          <p style={{ color: 'var(--danger, #c0392b)', fontSize: '.85rem', marginTop: '.5rem' }}>
            {discoverState.error}
          </p>
        )}
        {discoverState.ok && (
          <p style={{ color: 'var(--success, #1e7e34)', fontSize: '.85rem', marginTop: '.5rem' }}>
            {discoverState.found === 0
              ? 'No new places found nearby (you may already have them).'
              : `Staged ${discoverState.found} new place(s) below for your review.`}
          </p>
        )}
      </section>

      {/* Map of what guests actually see */}
      {typeof propertyLat === 'number' && typeof propertyLng === 'number' && (
        <StaticMapPreview
          lat={propertyLat}
          lng={propertyLng}
          markers={live
            .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
            .map((r) => ({
              lat: r.lat as number,
              lng: r.lng as number,
              color: r.host_preference === 'loved' ? 'f97362' : '6366f1',
            }))}
          height={240}
          width={1100}
          caption={`What guests see: your property (teal) and ${live.length} approved place${live.length === 1 ? '' : 's'} — your favorites in coral.`}
        />
      )}

      {/* Pending review */}
      {pending.length > 0 && (
        <section>
          <h3>Pending your review ({pending.length})</h3>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {pending.map((r) => (
              <RecCard key={r.id} rec={r} propertyId={propertyId} canEdit={canEdit} mode="pending" onDone={() => router.refresh()} />
            ))}
          </div>
        </section>
      )}

      {/* Live */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Shared with guests ({live.length})</h3>
          {canEdit && (
            <button className="btn-ghost" onClick={() => setShowAdd((s) => !s)} style={{ fontSize: '.85rem' }}>
              {showAdd ? 'Cancel' : '+ Add your own'}
            </button>
          )}
        </div>

        {showAdd && (
          <form action={addAction} className="card" style={{ padding: '1rem', margin: '.5rem 0', display: 'grid', gap: '.5rem' }}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input name="name" placeholder="Place name" required className="input" />
            <select name="category" className="select" defaultValue="restaurant">
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input name="url" placeholder="Website (optional)" className="input" />
            <textarea name="host_note" placeholder="Why you recommend it (optional)" className="textarea" rows={2} />
            <RowSubmit label="Add place" />
            {addState.error && <p style={{ color: 'var(--danger,#c0392b)', fontSize: '.8rem' }}>{addState.error}</p>}
          </form>
        )}

        {live.length === 0 ? (
          <p className="muted" style={{ fontSize: '.85rem' }}>Nothing shared yet. Find nearby places or add your own.</p>
        ) : (
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {live.map((r) => (
              <RecCard key={r.id} rec={r} propertyId={propertyId} canEdit={canEdit} mode="live" onDone={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>

      {/* Hidden */}
      {hidden.length > 0 && (
        <section>
          <h3 className="muted">Hidden ({hidden.length})</h3>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {hidden.map((r) => (
              <RecCard key={r.id} rec={r} propertyId={propertyId} canEdit={canEdit} mode="hidden" onDone={() => router.refresh()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecCard({
  rec,
  propertyId,
  canEdit,
  mode,
}: {
  rec: Rec;
  propertyId: string;
  canEdit: boolean;
  mode: 'pending' | 'live' | 'hidden';
  onDone: () => void;
}) {
  const [, action] = useFormState<RecActionState, FormData>(updateRecommendationAction, {});
  const [noteOpen, setNoteOpen] = useState(false);

  const loved = rec.host_preference === 'loved';
  const disliked = rec.host_preference === 'disliked';

  return (
    <div className="card" style={{ padding: '.75rem 1rem', opacity: mode === 'hidden' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <strong>{rec.name}</strong>
          {loved && <span title="Host favorite" style={{ marginLeft: 6 }}>★</span>}
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {CATEGORY_LABEL[rec.category ?? ''] ?? rec.category}
            {rec.distance_note ? ` · ${rec.distance_note}` : ''}
            {rec.ai_source === 'osm_overpass' ? ' · from map data' : rec.ai_source === 'host' ? ' · added by you' : ''}
          </div>
          {rec.host_note && <p style={{ fontSize: '.82rem', margin: '.35rem 0 0' }}>{rec.host_note}</p>}
          {rec.address && <p className="muted" style={{ fontSize: '.78rem', margin: '.2rem 0 0' }}>{rec.address}</p>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {mode === 'pending' && (
              <form action={action}>
                <input type="hidden" name="propertyId" value={propertyId} />
                <input type="hidden" name="recId" value={rec.id} />
                <input type="hidden" name="approved" value="true" />
                <RowSubmit label="Approve" />
              </form>
            )}
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="host_preference" value={loved ? 'neutral' : 'loved'} />
              {mode !== 'pending' && <input type="hidden" name="approved" value="true" />}
              <RowSubmit label={loved ? 'Unfavorite' : '★ Favorite'} />
            </form>
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="host_preference" value={disliked ? 'neutral' : 'disliked'} />
              <RowSubmit label={disliked ? 'Undislike' : 'Dislike'} />
            </form>
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="hidden" value={mode === 'hidden' ? 'false' : 'true'} />
              {mode === 'hidden' && <input type="hidden" name="approved" value="true" />}
              <RowSubmit label={mode === 'hidden' ? 'Unhide' : 'Hide'} />
            </form>
            <button className="btn-ghost" onClick={() => setNoteOpen((o) => !o)} style={{ fontSize: '.8rem' }}>
              Note
            </button>
            <form action={deleteRecommendationAction}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <RowSubmit label="Delete" />
            </form>
          </div>
        )}
      </div>
      {noteOpen && canEdit && (
        <form action={action} style={{ marginTop: '.5rem', display: 'flex', gap: '.4rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="recId" value={rec.id} />
          {mode !== 'pending' && <input type="hidden" name="approved" value="true" />}
          <input name="host_note" defaultValue={rec.host_note ?? ''} placeholder="Add a note guests will see" className="input" style={{ flex: 1 }} />
          <RowSubmit label="Save note" />
        </form>
      )}
    </div>
  );
}
