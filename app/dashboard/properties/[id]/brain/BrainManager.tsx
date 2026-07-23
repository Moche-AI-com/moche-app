'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { saveBrainItemAction, deleteBrainItemAction, type BrainActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

type BrainCat = string;
interface Item {
  id: string;
  title: string;
  body: string;
  category: BrainCat;
  visibility: string;
  status: string;
  sourceType: string;
}

export function BrainManager({
  propertyId,
  canEdit,
  categories,
  items,
  defaultCategory = 'core',
  editItemId,
}: {
  propertyId: string;
  canEdit: boolean;
  categories: [string, string][];
  items: Item[];
  defaultCategory?: string;
  editItemId?: string;
}) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);

  const open = (item: Item | null) => {
    setEditing(item);
    setShowForm(true);
  };

  // Deep-link from the knowledge graph: ?edit=<id> auto-opens that item's editor
  // and scrolls it into view. Runs once when a matching item is present.
  useEffect(() => {
    if (!canEdit || !editItemId) return;
    const target = items.find((i) => i.id === editItemId);
    if (!target) return;
    setEditing(target);
    setShowForm(true);
    // Let the form render, then scroll the editor region into view.
    const t = setTimeout(() => {
      document.getElementById('brain-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId]);

  return (
    <div>
      {canEdit && !showForm && (
        <button className="btn btn-primary" style={{ marginBottom: '1rem' }} onClick={() => open(null)} data-testid="button-add-brain">
          + Add knowledge
        </button>
      )}

      {showForm && canEdit && (
        <BrainItemForm
          propertyId={propertyId}
          categories={categories}
          item={editing}
          defaultCategory={defaultCategory}
          onDone={() => setShowForm(false)}
          key={editing?.id ?? 'new'}
        />
      )}

      {items.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">No knowledge yet. Add essentials like WiFi, check-in, and house rules to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {items.map((it) => (
            <div key={it.id} className="card" style={{ padding: '1rem' }} data-testid={`card-brain-${it.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{it.title}</strong>
                    {it.visibility === 'internal' && <span className="badge badge-coral">host-only</span>}
                    {it.status === 'failed' && <span className="badge badge-coral">index failed</span>}
                    {it.status === 'processing' && <span className="badge">processing…</span>}
                    {it.sourceType === 'url' && <span className="badge">URL</span>}
                    {it.sourceType === 'document' && <span className="badge">doc</span>}
                  </div>
                  {it.body && <p className="muted" style={{ fontSize: '.83rem', marginTop: '.35rem', whiteSpace: 'pre-wrap' }}>{truncate(it.body, 220)}</p>}
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => open(it)} data-testid={`button-edit-${it.id}`}>Edit</button>
                    <form action={deleteBrainItemAction}>
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <button className="btn btn-ghost btn-sm" type="submit" style={{ color: 'var(--coral)' }} data-testid={`button-delete-${it.id}`}>Delete</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrainItemForm({
  propertyId,
  categories,
  item,
  defaultCategory,
  onDone,
}: {
  propertyId: string;
  categories: [string, string][];
  item: Item | null;
  defaultCategory: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<BrainActionState, FormData>(saveBrainItemAction, {});
  if (state.ok) {
    // Close on success (next render).
    queueMicrotask(onDone);
  }
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', marginBottom: '1rem', borderColor: 'var(--teal-deep)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <h3 style={{ fontSize: '1.05rem' }}>{item ? 'Edit knowledge' : 'Add knowledge'}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <div className="field">
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" defaultValue={item?.title ?? ''} maxLength={200} required data-testid="input-brain-title" />
      </div>
      <div className="brain-form-grid">
        <div className="field">
          <label className="label" htmlFor="category">Category</label>
          <select className="select" id="category" name="category" defaultValue={item?.category ?? defaultCategory} data-testid="select-brain-category">
            {categories.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="visibility">Visibility</label>
          <select className="select" id="visibility" name="visibility" defaultValue={item?.visibility ?? 'guest'} data-testid="select-brain-visibility">
            <option value="guest">Guests can see</option>
            <option value="internal">Host-only (never shown to guests)</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="body">Details</label>
        <textarea className="textarea" id="body" name="body" defaultValue={item?.body ?? ''} rows={6} maxLength={20000} placeholder="e.g. WiFi network: Cottage_5G — password: SunnyDays2024" data-testid="input-brain-body" />
      </div>
      <SubmitButton>{item ? 'Save changes' : 'Add to Brain'}</SubmitButton>
    </form>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
