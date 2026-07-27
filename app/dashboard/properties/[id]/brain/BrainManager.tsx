'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import {
  Home, KeyRound, ScrollText, Cpu, MapPin, Car, Siren, FileText, Link2, HelpCircle, Lock, BookOpen,
} from 'lucide-react';
import { saveBrainItemAction, deleteBrainItemAction, type BrainActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';

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

// Small, tasteful icon per knowledge category so a grouped list scans at a
// glance instead of reading as a wall of identical cards. Falls back to
// BookOpen for any category not in the map (keeps this forward-compatible
// with new categories added later).
const CATEGORY_ICON: Record<string, typeof Home> = {
  core: Home,
  checkin_checkout: KeyRound,
  house_rules: ScrollText,
  appliances: Cpu,
  local_recommendations: MapPin,
  transportation: Car,
  emergency: Siren,
  documents: FileText,
  product_urls: Link2,
  host_qa: HelpCircle,
  internal_notes: Lock,
};

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
  const { isCollapsed, toggle } = useCollapsedCards();

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

  // Group items by category, in the same order as the category dropdown, and
  // drop empty groups — a host editing one card's worth of knowledge (e.g. via
  // ?card=safety) shouldn't see ten collapsed empty sections.
  const groups = useMemo(() => {
    const byCat = new Map<string, Item[]>();
    for (const it of items) {
      const arr = byCat.get(it.category) ?? [];
      arr.push(it);
      byCat.set(it.category, arr);
    }
    return categories
      .map(([value, label]) => ({ value, label, items: byCat.get(value) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [items, categories]);

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
        <div className="brain-groups">
          {groups.map((group) => {
            const Icon = CATEGORY_ICON[group.value] ?? BookOpen;
            const panelId = `brain-group-${group.value}`;
            const collapsed = isCollapsed(`brain-${propertyId}-${group.value}`);
            return (
              <section className="card brain-group" key={group.value}>
                <div className="brain-group-head">
                  <div className="brain-group-heading">
                    <Icon size={16} aria-hidden style={{ color: 'var(--iris)' }} />
                    <h3>{group.label.split('(')[0].trim()}</h3>
                    <span className="badge">{group.items.length}</span>
                  </div>
                  <CollapseToggle
                    collapsed={collapsed}
                    onToggle={() => toggle(`brain-${propertyId}-${group.value}`)}
                    panelId={panelId}
                    label={group.label}
                  />
                </div>
                <CollapsibleBody id={panelId} collapsed={collapsed}>
                  <div className="brain-item-list">
                    {group.items.map((it) => (
                      <BrainItemRow key={it.id} item={it} propertyId={propertyId} canEdit={canEdit} onEdit={() => open(it)} />
                    ))}
                  </div>
                </CollapsibleBody>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrainItemRow({
  item,
  propertyId,
  canEdit,
  onEdit,
}: {
  item: Item;
  propertyId: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="brain-item" data-testid={`card-brain-${item.id}`}>
      <div className="brain-item-body">
        <div className="brain-item-title-row">
          <strong className="brain-item-title">{item.title}</strong>
          {item.visibility === 'internal' && <span className="badge badge-coral">host-only</span>}
          {item.status === 'failed' && <span className="badge badge-coral">index failed</span>}
          {item.status === 'processing' && <span className="badge">processing…</span>}
          {item.sourceType === 'url' && <span className="badge">URL</span>}
          {item.sourceType === 'document' && <span className="badge">doc</span>}
        </div>
        {item.body && <p className="brain-item-preview">{truncate(item.body, 140)}</p>}
      </div>
      {canEdit && (
        <div className="brain-item-actions">
          <button className="btn btn-ghost btn-sm" onClick={onEdit} data-testid={`button-edit-${item.id}`}>Edit</button>
          <form action={deleteBrainItemAction}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="itemId" value={item.id} />
            <button className="btn btn-ghost btn-sm" type="submit" style={{ color: 'var(--coral)' }} data-testid={`button-delete-${item.id}`}>Delete</button>
          </form>
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
