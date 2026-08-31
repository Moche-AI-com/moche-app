'use client';

// Catalog search + one-click add (Manage Brain redesign, slice 4a) and the 4b sync
// entry point. Debounced typeahead against /api/properties/<id>/appliance-catalog;
// picking a result files it through addFromCatalogAction with brand/model carried by
// the catalog, not retyped. No match -> submit a candidate so the catalog learns from
// hosts. CatalogSyncForm sits on a linked appliance's card and pulls shared knowledge
// into the property's review queue.

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import {
  addFromCatalogAction,
  submitCatalogCandidateAction,
  pullCatalogKnowledgeAction,
} from './catalog-actions';
import type { ApplianceFormState } from './actions';

type CatalogHit = {
  id: string;
  category: string;
  brand: string;
  model: string;
  knowledgeCount: number;
  timesAdded: number;
};

const initialState: ApplianceFormState = {};

function Message({ state }: { state: ApplianceFormState }) {
  if (state.error) return <p role="alert" className="error">{state.error}</p>;
  if (state.success) return <p role="status" className="success">{state.success}</p>;
  return null;
}

export function CatalogSearch({ propertyId }: { propertyId: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogHit | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/properties/${propertyId}/appliance-catalog?q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as { results?: CatalogHit[] };
        setHits(json.results ?? []);
      } catch {
        // Aborted or offline: leave the previous list in place.
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, propertyId]);

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Search the catalog</h2>
      <p className="faint" style={{ margin: '.25rem 0 .75rem', fontSize: '.8rem' }}>
        Type a brand or model number and pick it — brand, model, and category come from the shared
        catalog, so manual knowledge can attach automatically as it lands.
      </p>
      <input
        className="input"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSelected(null);
        }}
        placeholder="e.g. Whirlpool WTW5000DW"
        data-testid="input-catalog-search"
        aria-label="Search the appliance catalog"
      />

      {selected ? (
        <CatalogConfirm propertyId={propertyId} hit={selected} onClear={() => setSelected(null)} />
      ) : (
        <>
          {searching && <p className="faint" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>Searching…</p>}
          {!searching && hits.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '.5rem 0 0', padding: 0 }}>
              {hits.map((h) => (
                <li key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                    onClick={() => setSelected(h)}
                    data-testid={`catalog-hit-${h.id}`}
                  >
                    {h.brand} {h.model}
                    <span className="faint" style={{ marginLeft: '.5rem', fontSize: '.75rem' }}>
                      {h.category.replace(/_/g, ' ')}
                      {h.knowledgeCount > 0 ? ` · ${h.knowledgeCount} answers on file` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && q.trim().length >= 2 && hits.length === 0 && (
            <CandidateSubmit propertyId={propertyId} query={q.trim()} />
          )}
        </>
      )}
    </div>
  );
}

function CatalogConfirm({
  propertyId,
  hit,
  onClear,
}: {
  propertyId: string;
  hit: CatalogHit;
  onClear: () => void;
}) {
  const [state, formAction] = useFormState(addFromCatalogAction, initialState);
  return (
    <form action={formAction} style={{ marginTop: '.75rem' }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="catalogId" value={hit.id} />
      <p style={{ margin: '0 0 .5rem' }}>
        <strong>{hit.brand} {hit.model}</strong>{' '}
        <span className="faint">· {hit.category.replace(/_/g, ' ')}</span>
      </p>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <label className="field">
          <span className="label">Display name</span>
          <input className="input" name="displayName" maxLength={160} defaultValue={`${hit.brand} ${hit.model}`} />
        </label>
        <label className="field">
          <span className="label">Location note</span>
          <input className="input" name="locationNote" maxLength={300} placeholder="e.g. Laundry closet" />
        </label>
      </div>
      <Message state={state} />
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', alignItems: 'center' }}>
        <button className="button" type="submit" data-testid="button-catalog-add">Add to inventory</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Back to results</button>
      </div>
    </form>
  );
}

function CandidateSubmit({ propertyId, query }: { propertyId: string; query: string }) {
  const [state, formAction] = useFormState(submitCatalogCandidateAction, initialState);
  return (
    <form action={formAction} style={{ marginTop: '.75rem' }}>
      <p className="faint" style={{ fontSize: '.8rem', margin: '0 0 .5rem' }}>
        No match in the catalog yet. Submit it and we will review it — or add it manually below.
      </p>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="rawModel" value={query} />
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <label className="field">
          <span className="label">Brand (if known)</span>
          <input className="input" name="rawBrand" maxLength={120} />
        </label>
        <label className="field">
          <span className="label">Type</span>
          <select className="select" name="rawCategory" defaultValue="other">
            <option value="washer">Washer</option>
            <option value="dryer">Dryer</option>
            <option value="dishwasher">Dishwasher</option>
            <option value="refrigerator">Refrigerator</option>
            <option value="range">Range / Oven</option>
            <option value="microwave">Microwave</option>
            <option value="coffee_maker">Coffee maker</option>
            <option value="thermostat">Thermostat</option>
            <option value="water_heater">Water heater</option>
            <option value="tv">TV</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <Message state={state} />
      <button className="btn btn-ghost btn-sm" type="submit" style={{ marginTop: '.5rem' }}>
        Submit to the catalog
      </button>
    </form>
  );
}

/** Slice 4b: on a catalog-linked appliance, pull shared knowledge into the review list. */
export function CatalogSyncForm({ propertyId, applianceId }: { propertyId: string; applianceId: string }) {
  const [state, formAction] = useFormState(pullCatalogKnowledgeAction, initialState);
  return (
    <form action={formAction} style={{ marginTop: '.75rem' }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="applianceId" value={applianceId} />
      <Message state={state} />
      <button className="btn btn-ghost btn-sm" type="submit" data-testid={`button-catalog-sync-${applianceId}`}>
        Sync shared knowledge from the catalog
      </button>
    </form>
  );
}
