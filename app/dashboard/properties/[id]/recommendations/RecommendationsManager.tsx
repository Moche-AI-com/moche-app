'use client';

import { useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import StaticMapPreview from '@/components/StaticMapPreview';
import { CURATION_TAGS, CURATION_TAG_LABEL } from '@/lib/local/categories';
import { haversineMeters } from '@/lib/local/distance';
import { deriveCurationStatus, computeCategoryCoverage, type CurationStatus } from '@/lib/local/curation';
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
  tags: string[];
  price_level: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  attraction: 'Attraction',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
};

const STATUS_LABEL: Record<CurationStatus, string> = {
  unreviewed: 'Pending review',
  approved: 'Shared with guests',
  favorite: 'Favorite',
  rejected: 'Hidden',
};

const DISTANCE_OPTIONS = [
  { value: '', label: 'Any distance' },
  { value: '0.5', label: 'Within 0.5 mi' },
  { value: '1', label: 'Within 1 mi' },
  { value: '3', label: 'Within 3 mi' },
  { value: '5', label: 'Within 5 mi' },
] as const;

const PRICE_LABEL: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

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

// Bulk actions call the server action directly with a synthesized FormData —
// there's no single <form> around a variable-length selection, so this
// bypasses useFormState (which needs a static form) rather than fighting it.
async function applyBulkPatch(
  propertyId: string,
  recId: string,
  patch: { approved?: boolean; hidden?: boolean; host_preference?: 'loved' | 'neutral' | 'disliked' },
) {
  const fd = new FormData();
  fd.set('propertyId', propertyId);
  fd.set('recId', recId);
  if (patch.approved !== undefined) fd.set('approved', String(patch.approved));
  if (patch.hidden !== undefined) fd.set('hidden', String(patch.hidden));
  if (patch.host_preference !== undefined) fd.set('host_preference', patch.host_preference);
  await updateRecommendationAction({}, fd);
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

  // --- Search / filter state -------------------------------------------------
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CurationStatus | ''>('');
  const [priceFilter, setPriceFilter] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const distanceMiles = (r: Rec): number | null => {
    if (typeof propertyLat !== 'number' || typeof propertyLng !== 'number') return null;
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return null;
    return haversineMeters(propertyLat, propertyLng, r.lat, r.lng) / 1609.344;
  };

  const withStatus = useMemo(
    () => initialRecs.map((r) => ({ rec: r, status: deriveCurationStatus(r) })),
    [initialRecs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const maxMiles = distanceFilter ? parseFloat(distanceFilter) : null;
    return withStatus.filter(({ rec, status }) => {
      if (q && !rec.name.toLowerCase().includes(q) && !(rec.address ?? '').toLowerCase().includes(q)) return false;
      if (categoryFilter && rec.category !== categoryFilter) return false;
      if (statusFilter && status !== statusFilter) return false;
      if (priceFilter && String(rec.price_level ?? '') !== priceFilter) return false;
      if (maxMiles != null) {
        const d = distanceMiles(rec);
        if (d == null || d > maxMiles) return false;
      }
      return true;
    });
  }, [withStatus, search, categoryFilter, statusFilter, priceFilter, distanceFilter]);

  const pending = filtered.filter((x) => x.status === 'unreviewed').map((x) => x.rec);
  const live = filtered
    .filter((x) => x.status === 'approved' || x.status === 'favorite')
    .map((x) => x.rec);
  const hidden = filtered.filter((x) => x.status === 'rejected').map((x) => x.rec);

  const coverage = useMemo(
    () =>
      computeCategoryCoverage(
        withStatus.filter((x) => x.status === 'approved' || x.status === 'favorite').map((x) => x.rec),
        Object.keys(CATEGORY_LABEL),
      ),
    [withStatus],
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = async (patch: { approved?: boolean; hidden?: boolean; host_preference?: 'loved' | 'neutral' | 'disliked' }) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => applyBulkPatch(propertyId, id, patch)));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  };

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

      {/* Coverage indicator */}
      <section className="card" style={{ padding: '.85rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.9rem' }}>
            Category coverage: {coverage.covered}/{coverage.total}
          </strong>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            {coverage.byCategory.map((c) => (
              <span
                key={c.category}
                className="muted"
                title={`${c.approvedCount} approved pick(s)`}
                style={{
                  fontSize: '.72rem',
                  padding: '.15rem .45rem',
                  borderRadius: 999,
                  background: c.approvedCount > 0 ? 'var(--success-bg, #e6f4ea)' : 'var(--warn-bg, #fdf0e6)',
                  color: c.approvedCount > 0 ? 'var(--success, #1e7e34)' : 'var(--warn, #b35c00)',
                }}
              >
                {CATEGORY_LABEL[c.category] ?? c.category}
              </span>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: '.78rem', margin: '.4rem 0 0' }}>
          Categories with no approved pick have nothing for the concierge to suggest guests.
        </p>
      </section>

      {/* Search + filters */}
      <section className="card" style={{ padding: '.85rem 1rem', display: 'grid', gap: '.6rem' }}>
        <input
          className="input"
          placeholder="Search by name or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CurationStatus | '')}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as CurationStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select className="select" value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}>
            <option value="">Any price</option>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>{PRICE_LABEL[p]}</option>
            ))}
          </select>
          <select className="select" value={distanceFilter} onChange={(e) => setDistanceFilter(e.target.value)}>
            {DISTANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
            <h3 style={{ margin: 0 }}>Pending your review ({pending.length})</h3>
            {canEdit && selected.size > 0 && (
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn-ghost" disabled={bulkBusy} style={{ fontSize: '.8rem' }} onClick={() => runBulk({ approved: true, hidden: false })}>
                  Approve {selected.size} selected
                </button>
                <button className="btn-ghost" disabled={bulkBusy} style={{ fontSize: '.8rem' }} onClick={() => runBulk({ approved: true, hidden: true })}>
                  Reject {selected.size} selected
                </button>
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: '.75rem', margin: '.3rem 0 .5rem' }}>
            Focus a card and press A to approve, F to favorite, X to reject, arrow keys to move.
          </p>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {pending.map((r) => (
              <RecCard
                key={r.id}
                rec={r}
                propertyId={propertyId}
                canEdit={canEdit}
                mode="pending"
                selected={selected.has(r.id)}
                onToggleSelected={() => toggleSelected(r.id)}
              />
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
              <RecCard key={r.id} rec={r} propertyId={propertyId} canEdit={canEdit} mode="live" />
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
              <RecCard key={r.id} rec={r} propertyId={propertyId} canEdit={canEdit} mode="hidden" />
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
  selected,
  onToggleSelected,
}: {
  rec: Rec;
  propertyId: string;
  canEdit: boolean;
  mode: 'pending' | 'live' | 'hidden';
  selected?: boolean;
  onToggleSelected?: () => void;
}) {
  const [, action] = useFormState<RecActionState, FormData>(updateRecommendationAction, {});
  const [noteOpen, setNoteOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const approveFormRef = useRef<HTMLFormElement>(null);
  const favoriteFormRef = useRef<HTMLFormElement>(null);
  const hideFormRef = useRef<HTMLFormElement>(null);

  const loved = rec.host_preference === 'loved';
  const disliked = rec.host_preference === 'disliked';

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canEdit || noteOpen || tagsOpen) return;
    const key = e.key.toLowerCase();
    if (key === 'a' && mode === 'pending') {
      e.preventDefault();
      approveFormRef.current?.requestSubmit();
    } else if (key === 'f') {
      e.preventDefault();
      favoriteFormRef.current?.requestSubmit();
    } else if (key === 'x') {
      e.preventDefault();
      hideFormRef.current?.requestSubmit();
    } else if (key === 'arrowdown' || key === 'arrowup') {
      e.preventDefault();
      const container = e.currentTarget.parentElement;
      if (!container) return;
      const cards = Array.from(container.children) as HTMLElement[];
      const idx = cards.indexOf(e.currentTarget);
      const next = key === 'arrowdown' ? cards[idx + 1] : cards[idx - 1];
      next?.focus();
    }
  };

  return (
    <div
      className="card"
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={onKeyDown}
      style={{ padding: '.75rem 1rem', opacity: mode === 'hidden' ? 0.6 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, display: 'flex', gap: '.5rem' }}>
          {canEdit && mode === 'pending' && onToggleSelected && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelected}
              aria-label={`Select ${rec.name}`}
              style={{ marginTop: '.3rem' }}
            />
          )}
          <div>
            <strong>{rec.name}</strong>
            {loved && <span title="Host favorite" style={{ marginLeft: 6 }}>★</span>}
            <div className="muted" style={{ fontSize: '.8rem' }}>
              {CATEGORY_LABEL[rec.category ?? ''] ?? rec.category}
              {rec.distance_note ? ` · ${rec.distance_note}` : ''}
              {rec.price_level ? ` · ${PRICE_LABEL[rec.price_level]}` : ''}
              {rec.ai_source === 'osm_overpass' ? ' · from map data' : rec.ai_source === 'host' ? ' · added by you' : ''}
            </div>
            {rec.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', margin: '.3rem 0 0' }}>
                {rec.tags.map((t) => (
                  <span key={t} className="muted" style={{ fontSize: '.7rem', padding: '.1rem .4rem', borderRadius: 999, background: 'var(--surface-2, #f1f1f4)' }}>
                    {CURATION_TAG_LABEL[t] ?? t}
                  </span>
                ))}
              </div>
            )}
            {rec.host_note && <p style={{ fontSize: '.82rem', margin: '.35rem 0 0' }}>{rec.host_note}</p>}
            {rec.address && <p className="muted" style={{ fontSize: '.78rem', margin: '.2rem 0 0' }}>{rec.address}</p>}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {mode === 'pending' && (
              <form ref={approveFormRef} action={action}>
                <input type="hidden" name="propertyId" value={propertyId} />
                <input type="hidden" name="recId" value={rec.id} />
                <input type="hidden" name="approved" value="true" />
                <RowSubmit label="Approve (A)" />
              </form>
            )}
            <form ref={favoriteFormRef} action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="host_preference" value={loved ? 'neutral' : 'loved'} />
              {mode !== 'pending' && <input type="hidden" name="approved" value="true" />}
              <RowSubmit label={loved ? 'Unfavorite' : '★ Favorite (F)'} />
            </form>
            <form action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="host_preference" value={disliked ? 'neutral' : 'disliked'} />
              <RowSubmit label={disliked ? 'Undislike' : 'Dislike'} />
            </form>
            <form ref={hideFormRef} action={action}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="recId" value={rec.id} />
              <input type="hidden" name="hidden" value={mode === 'hidden' ? 'false' : 'true'} />
              {mode === 'hidden' && <input type="hidden" name="approved" value="true" />}
              <RowSubmit label={mode === 'hidden' ? 'Unhide' : 'Reject (X)'} />
            </form>
            <button className="btn-ghost" onClick={() => setNoteOpen((o) => !o)} style={{ fontSize: '.8rem' }}>
              Note
            </button>
            <button className="btn-ghost" onClick={() => setTagsOpen((o) => !o)} style={{ fontSize: '.8rem' }}>
              Tags
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
      {tagsOpen && canEdit && (
        <form action={action} style={{ marginTop: '.5rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="recId" value={rec.id} />
          {mode !== 'pending' && <input type="hidden" name="approved" value="true" />}
          {CURATION_TAGS.map((t) => (
            <label key={t.value} style={{ fontSize: '.78rem', display: 'flex', gap: '.25rem', alignItems: 'center' }}>
              <input type="checkbox" name="tags" value={t.value} defaultChecked={rec.tags.includes(t.value)} />
              {t.label}
            </label>
          ))}
          <select name="price_level" className="select" defaultValue={rec.price_level ?? ''} style={{ fontSize: '.78rem' }}>
            <option value="">No price</option>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>{PRICE_LABEL[p]}</option>
            ))}
          </select>
          <RowSubmit label="Save" />
        </form>
      )}
    </div>
  );
}
