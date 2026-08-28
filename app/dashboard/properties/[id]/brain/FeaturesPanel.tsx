'use client';

// Spaces & features (2026-08-28 directive). The "+ Add" surface for custom Brain
// sections: a searchable catalog — not a wall of toggles — creates a feature with
// the three structured inputs the concierge needs (where it is, whether guests may
// use it, notes). "Draft with AI" proposes notes on the brain_ops tier; the host
// edits the draft and saves, so nothing the AI writes lands without that save.

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { Archive, Pencil, Plus, Search, Sparkles } from 'lucide-react';
import { FEATURE_CATALOG, type PropertyFeature } from '@/lib/brain/taxonomy';
import {
  archiveFeatureAction,
  draftFeatureDescriptionAction,
  saveFeatureAction,
  type FeatureActionState,
} from './feature-actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

const ACCESS_LABEL: Record<PropertyFeature['guestAccess'], string> = {
  yes: 'Guests can use it',
  supervised: 'Ask host / supervised',
  no: 'Not for guests',
};

export function FeaturesPanel({
  propertyId,
  canEdit,
  features,
}: {
  propertyId: string;
  canEdit: boolean;
  features: PropertyFeature[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<{ key: string | null; label: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Catalog minus what the property already has, filtered by the search box. A
  // feature already added disappears from the picker rather than erroring on save.
  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(features.map((f) => f.catalogKey).filter(Boolean));
    return FEATURE_CATALOG.filter(
      (e) =>
        !taken.has(e.key) &&
        (!q || e.label.toLowerCase().includes(q) || e.hint.toLowerCase().includes(q)),
    );
  }, [query, features]);

  const startAdd = (key: string | null, label: string) => {
    setEditingId(null);
    setPickerOpen(false);
    setQuery('');
    setAdding({ key, label });
  };

  return (
    <section className="card" style={{ padding: '1.15rem', marginBottom: '1rem' }} data-testid="features-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Spaces &amp; features</h3>
          <p className="faint" style={{ fontSize: '.78rem', margin: '.35rem 0 0', maxWidth: '60ch' }}>
            Tell the concierge what this place has — pool, grill, shed, anything. Each one becomes
            its own section you can file knowledge under.
          </p>
        </div>
        {canEdit && !pickerOpen && adding === null && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPickerOpen(true)}
            data-testid="button-add-feature"
          >
            <Plus size={14} aria-hidden /> Add
          </button>
        )}
      </div>

      {features.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '.85rem 0 0', padding: 0, display: 'grid', gap: '.5rem' }}>
          {features.map((f) =>
            editingId === f.id ? (
              <li key={f.id}>
                <FeatureForm propertyId={propertyId} feature={f} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <FeatureRow
                key={f.id}
                propertyId={propertyId}
                feature={f}
                canEdit={canEdit}
                onEdit={() => {
                  setAdding(null);
                  setEditingId(f.id);
                }}
              />
            ),
          )}
        </ul>
      )}

      {features.length === 0 && !pickerOpen && adding === null && (
        <p className="faint" style={{ fontSize: '.82rem', margin: '.75rem 0 0' }}>
          None yet — add one and the concierge can answer questions about it.
        </p>
      )}

      {canEdit && pickerOpen && (
        <div style={{ marginTop: '.85rem' }}>
          <div style={{ position: 'relative', marginBottom: '.6rem' }}>
            <Search
              size={14}
              aria-hidden
              style={{ position: 'absolute', left: '.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}
            />
            <input
              className="input"
              style={{ paddingLeft: '2rem' }}
              placeholder="Search — pool, grill, EV charger…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="input-feature-search"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the picker opens on an
              // explicit click; focus belongs in its search box.
              autoFocus
            />
          </div>
          <div className="brain-empty-chips">
            {catalog.map((e) => (
              <button
                key={e.key}
                type="button"
                className="brain-empty-chip"
                title={e.hint}
                onClick={() => startAdd(e.key, e.label)}
                data-testid={`button-feature-${e.key}`}
              >
                {e.label}
                <span aria-hidden className="faint"> +</span>
              </button>
            ))}
            <button
              type="button"
              className="brain-empty-chip"
              onClick={() => startAdd(null, '')}
              data-testid="button-feature-custom"
            >
              Something else
              <span aria-hidden className="faint"> +</span>
            </button>
          </div>
          {catalog.length === 0 && (
            <p className="faint" style={{ fontSize: '.78rem', margin: '.5rem 0 0' }}>
              No catalog match — use “Something else” and name it yourself.
            </p>
          )}
          <div style={{ marginTop: '.6rem' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {canEdit && adding !== null && (
        <div style={{ marginTop: '.85rem' }}>
          <FeatureForm
            propertyId={propertyId}
            feature={null}
            catalogKey={adding.key}
            defaultLabel={adding.label}
            onDone={() => setAdding(null)}
          />
        </div>
      )}
    </section>
  );
}

function FeatureRow({
  propertyId,
  feature,
  canEdit,
  onEdit,
}: {
  propertyId: string;
  feature: PropertyFeature;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <li className="brain-item" data-testid={`feature-${feature.id}`}>
      <div className="brain-item-body">
        <div className="brain-item-title-row">
          <strong className="brain-item-title">{feature.label}</strong>
          {feature.createdVia === 'ai' && <span className="badge">AI suggested</span>}
          <span className={`badge${feature.guestAccess === 'no' ? ' badge-coral' : ''}`}>
            {ACCESS_LABEL[feature.guestAccess]}
          </span>
        </div>
        <p className="brain-item-preview">
          {[feature.location ? `Where: ${feature.location}` : null, feature.notes]
            .filter(Boolean)
            .join(' · ') || 'No details yet — edit to add them.'}
        </p>
      </div>
      {canEdit && (
        <div className="brain-item-actions">
          <button className="btn btn-ghost btn-sm" onClick={onEdit} data-testid={`button-edit-feature-${feature.id}`}>
            <Pencil size={13} aria-hidden /> Edit
          </button>
          <form action={archiveFeatureAction}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="featureId" value={feature.id} />
            <button
              className="btn btn-ghost btn-sm"
              type="submit"
              style={{ color: 'var(--coral)' }}
              title="Archive — knowledge filed here stays in the Brain"
              data-testid={`button-archive-feature-${feature.id}`}
            >
              <Archive size={13} aria-hidden /> Archive
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function FeatureForm({
  propertyId,
  feature,
  catalogKey = null,
  defaultLabel = '',
  onDone,
}: {
  propertyId: string;
  feature: PropertyFeature | null;
  catalogKey?: string | null;
  defaultLabel?: string;
  onDone: () => void;
}) {
  const [saveState, saveAction] = useFormState<FeatureActionState, FormData>(saveFeatureAction, {});
  const [draftState, draftAction] = useFormState<FeatureActionState, FormData>(draftFeatureDescriptionAction, {});
  const [pendingDraft, startDraft] = useTransition();

  // Controlled fields: the draft button needs the current values without submitting
  // the save form, so it builds its own FormData from state.
  const [label, setLabel] = useState(feature?.label ?? defaultLabel);
  const [location, setLocation] = useState(feature?.location ?? '');
  const [guestAccess, setGuestAccess] = useState<PropertyFeature['guestAccess']>(feature?.guestAccess ?? 'yes');
  const [notes, setNotes] = useState(feature?.notes ?? '');

  if (saveState.ok) queueMicrotask(onDone);
  useEffect(() => {
    if (draftState.ok && draftState.draft) setNotes(draftState.draft);
  }, [draftState]);

  const uid = feature ? `edit-${feature.id}` : 'new';
  const fieldId = (name: string) => `feature-${name}-${uid}`;

  const draft = () => {
    const fd = new FormData();
    fd.set('propertyId', propertyId);
    fd.set('label', label);
    fd.set('location', location);
    fd.set('guestAccess', guestAccess);
    fd.set('notes', notes);
    startDraft(() => draftAction(fd));
  };

  return (
    <form
      action={saveAction}
      className="card"
      style={{ padding: '1rem', borderColor: 'var(--teal-deep)' }}
      data-testid="feature-form"
    >
      <div className="brain-item-inline-head">
        <h4>{feature ? `Edit ${feature.label}` : label.trim() ? `Add: ${label}` : 'Add a space or feature'}</h4>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
      <FormMessage error={saveState.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {feature && <input type="hidden" name="featureId" value={feature.id} />}
      {catalogKey && <input type="hidden" name="catalogKey" value={catalogKey} />}

      <div className="brain-form-grid">
        <div className="field">
          <label className="label" htmlFor={fieldId('label')}>Name</label>
          <input
            className="input"
            id={fieldId('label')}
            name="label"
            required
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Pool house"
            data-testid="input-feature-label"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={fieldId('guestAccess')}>Can guests use it?</label>
          <select
            className="select"
            id={fieldId('guestAccess')}
            name="guestAccess"
            value={guestAccess}
            onChange={(e) => setGuestAccess(e.target.value as PropertyFeature['guestAccess'])}
            data-testid="select-feature-access"
          >
            <option value="yes">Yes — guests can use it</option>
            <option value="supervised">Ask host / supervised only</option>
            <option value="no">No — not for guests</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor={fieldId('location')}>Where is it?</label>
        <input
          className="input"
          id={fieldId('location')}
          name="location"
          maxLength={240}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Backyard, left of the deck"
          data-testid="input-feature-location"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={fieldId('notes')}>Notes for the concierge</label>
        <textarea
          className="textarea"
          id={fieldId('notes')}
          name="notes"
          rows={4}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Rules, hours, how to use it, what guests should know…"
          data-testid="input-feature-notes"
        />
      </div>
      <div className="enhance-actions">
        <SubmitButton>{feature ? 'Save changes' : 'Add feature'}</SubmitButton>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={draft}
          disabled={pendingDraft || !label.trim()}
          data-testid="button-feature-draft"
        >
          <Sparkles size={14} aria-hidden /> {pendingDraft ? 'Drafting…' : 'Draft with AI'}
        </button>
      </div>
      {draftState.error && <FormMessage error={draftState.error} />}
    </form>
  );
}
