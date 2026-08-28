'use client';

// The unified Brain manager (§4, §7).
//
// Design notes, oldest to newest:
//   1. One taxonomy. Groups are canonical Brain sections resolved server-side, not raw
//      `brain_category` values, so the heading a host reads here is the same string used
//      by the Coverage Map, Import Knowledge, and AI routing.
//   2. Inline editing. A row expands into its own editor in place. The old behaviour
//      threw a single form to the top of the page, which meant editing the 30th item
//      scrolled the host away from it and lost their place on save.
//   3. Empty sections are listed, not rendered as ten empty cards. A host needs to know
//      a section exists and is unfilled; they do not need ten collapsed placeholders.
//   4. Graph navigation target (2026-08-28). The Coverage Map spins and its clicks
//      dispatch `moche:brain-goto`; this component owns the target DOM, so it performs
//      the work — expand the section if collapsed, open the add-knowledge form when the
//      click came from a gap dot, flash the target card, and scroll it into view. An
//      in-progress edit is never disturbed by a navigation click.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import {
  Wifi, KeyRound, Banknote, Home, Car, Cpu, MapPin, ScrollText, LogOut, Siren, BookOpen,
} from 'lucide-react';
import { saveBrainItemAction, deleteBrainItemAction, type BrainActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';

/** Event the Coverage Map dispatches when a hub or gap dot is activated. Exported so the
    map and the manager can never drift on the event name. */
export const BRAIN_GOTO_EVENT = 'moche:brain-goto';
export interface BrainGotoDetail {
  /** Canonical section id to navigate to. */
  section: string;
  /** True when the click came from a gap dot: open the add form, not just the section. */
  openAdd: boolean;
}

export interface BrainManagerItem {
  id: string;
  title: string;
  body: string;
  /** Canonical section id, resolved on the server. Never a raw brain_category. */
  section: string;
  visibility: string;
  status: string;
  sourceType: string;
}

export interface BrainManagerSection {
  value: string;
  label: string;
  blurb: string;
}

// One icon per canonical section. Keyed by registry domain_id, falling back to BookOpen
// so a domain added to the registry renders rather than crashing.
const SECTION_ICON: Record<string, typeof Home> = {
  connectivity: Wifi,
  access_security: KeyRound,
  policies_money: Banknote,
  space_details: Home,
  parking: Car,
  amenities: Cpu,
  local_area: MapPin,
  house_rules: ScrollText,
  checkout: LogOut,
  maintenance_escalation: Siren,
};

export function BrainManager({
  propertyId,
  canEdit,
  sections,
  items,
  defaultSection,
  editItemId,
}: {
  propertyId: string;
  canEdit: boolean;
  sections: BrainManagerSection[];
  items: BrainManagerItem[];
  defaultSection?: string;
  editItemId?: string;
}) {
  const fallbackSection = defaultSection ?? sections[0]?.value ?? 'space_details';
  // Which row is expanded into an editor, or a section id when adding a new item there.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  // The section card currently flashing as a navigation target, if any.
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const { isCollapsed, toggle } = useCollapsedCards();
  // The goto listener reads collapse state through a ref so it can subscribe once per
  // property instead of re-subscribing on every collapse toggle.
  const collapsedRef = useRef(isCollapsed);
  useEffect(() => {
    collapsedRef.current = isCollapsed;
  });

  const startEdit = (id: string) => {
    setAddingIn(null);
    setEditingId(id);
  };
  const startAdd = (section: string) => {
    setEditingId(null);
    setAddingIn(section);
  };

  // Deep-link: ?edit=<id> expands that row and scrolls to it.
  useEffect(() => {
    if (!canEdit || !editItemId) return;
    if (!items.some((i) => i.id === editItemId)) return;
    setEditingId(editItemId);
    const t = setTimeout(() => {
      document
        .getElementById(`brain-item-${editItemId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId]);

  // Graph navigation. The map dispatches; the manager owns the DOM, so it does the
  // work: expand the target section, open the add form for gap-dot clicks, flash the
  // card, then scroll. Deliberately does NOT touch editingId — a graph click must never
  // silently discard an edit the host is halfway through.
  useEffect(() => {
    function onGoto(event: Event) {
      const detail = (event as CustomEvent<BrainGotoDetail>).detail;
      if (!detail?.section) return;
      const { section, openAdd } = detail;
      const key = `brain-${propertyId}-${section}`;
      if (collapsedRef.current(key)) toggle(key);
      if (openAdd && canEdit) {
        setEditingId(null);
        setAddingIn(section);
      }
      setFlashSection(section);
      // After state flushes: the add form renders at the top (id brain-editor), a filled
      // section has its own card, an empty one only exists as a chip in the N/A card.
      window.setTimeout(() => {
        const target = openAdd
          ? document.getElementById('brain-editor') ??
            document.getElementById(`brain-section-${section}`) ??
            document.getElementById('brain-empty-sections')
          : document.getElementById(`brain-section-${section}`) ??
            document.getElementById('brain-empty-sections');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
    window.addEventListener(BRAIN_GOTO_EVENT, onGoto);
    return () => window.removeEventListener(BRAIN_GOTO_EVENT, onGoto);
  }, [propertyId, canEdit, toggle]);

  // Clear the flash after the pulse finishes (1.6s animation + margin).
  useEffect(() => {
    if (!flashSection) return;
    const t = setTimeout(() => setFlashSection(null), 1800);
    return () => clearTimeout(t);
  }, [flashSection]);

  const { filled, empty } = useMemo(() => {
    const bySection = new Map<string, BrainManagerItem[]>();
    for (const it of items) {
      const arr = bySection.get(it.section) ?? [];
      arr.push(it);
      bySection.set(it.section, arr);
    }
    const groups = sections.map((s) => ({ ...s, items: bySection.get(s.value) ?? [] }));
    // Anything resolving to a section the caller did not offer still has to render. An
    // item silently missing from this list is worse than an oddly-labelled group, and it
    // is the failure mode when the offered section set is narrowed.
    const known = new Set(sections.map((s) => s.value));
    for (const [section, arr] of bySection) {
      if (known.has(section)) continue;
      groups.push({ value: section, label: 'Unsorted', blurb: 'Move these into a section.', items: arr });
    }
    return {
      filled: groups.filter((g) => g.items.length > 0),
      empty: groups.filter((g) => g.items.length === 0 && known.has(g.value)),
    };
  }, [items, sections]);

  return (
    <div>
      {canEdit && addingIn === null && (
        <button
          className="btn btn-primary"
          style={{ marginBottom: '1rem' }}
          onClick={() => startAdd(fallbackSection)}
          data-testid="button-add-brain"
        >
          + Add knowledge
        </button>
      )}

      {canEdit && addingIn !== null && (
        <BrainItemForm
          propertyId={propertyId}
          sections={sections}
          item={null}
          defaultSection={addingIn}
          onDone={() => setAddingIn(null)}
          key={`new-${addingIn}`}
        />
      )}

      {items.length === 0 && addingIn === null ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">
            No knowledge yet. Wi-Fi, check-in, and house rules are the three your guests ask about
            first — start there.
          </p>
        </div>
      ) : (
        <div className="brain-groups">
          {filled.map((group) => {
            const Icon = SECTION_ICON[group.value] ?? BookOpen;
            const panelId = `brain-group-${group.value}`;
            const key = `brain-${propertyId}-${group.value}`;
            const collapsed = isCollapsed(key);
            return (
              <section
                className={`card brain-group${flashSection === group.value ? ' is-flashed' : ''}`}
                id={`brain-section-${group.value}`}
                key={group.value}
              >
                <div className="brain-group-head">
                  <div className="brain-group-heading">
                    <Icon size={16} aria-hidden style={{ color: 'var(--iris)' }} />
                    <h3>{group.label}</h3>
                    <span className="badge">{group.items.length}</span>
                  </div>
                  <div className="brain-group-actions">
                    {canEdit && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => startAdd(group.value)}
                        data-testid={`button-add-${group.value}`}
                      >
                        + Add
                      </button>
                    )}
                    <CollapseToggle
                      collapsed={collapsed}
                      onToggle={() => toggle(key)}
                      panelId={panelId}
                      label={group.label}
                    />
                  </div>
                </div>
                <CollapsibleBody id={panelId} collapsed={collapsed}>
                  {group.blurb && <p className="faint brain-group-blurb">{group.blurb}</p>}
                  <div className="brain-item-list">
                    {group.items.map((it) =>
                      editingId === it.id ? (
                        <div className="brain-item is-editing" id={`brain-item-${it.id}`} key={it.id}>
                          <BrainItemForm
                            propertyId={propertyId}
                            sections={sections}
                            item={it}
                            defaultSection={it.section}
                            inline
                            onDone={() => setEditingId(null)}
                          />
                        </div>
                      ) : (
                        <BrainItemRow
                          key={it.id}
                          item={it}
                          propertyId={propertyId}
                          canEdit={canEdit}
                          onEdit={() => startEdit(it.id)}
                        />
                      ),
                    )}
                  </div>
                </CollapsibleBody>
              </section>
            );
          })}

          {empty.length > 0 && (
            <section
              className="card brain-group brain-empty-sections"
              id="brain-empty-sections"
              data-testid="brain-empty-sections"
            >
              <h3 className="brain-empty-heading">Nothing filed here yet</h3>
              <p className="faint brain-group-blurb">
                Your concierge has no answers for these sections. Empty is fine when a section
                genuinely does not apply — mark it N/A under “What this place has” so it stops
                counting against you.
              </p>
              <div className="brain-empty-chips">
                {empty.map((g) => {
                  const Icon = SECTION_ICON[g.value] ?? BookOpen;
                  return canEdit ? (
                    <button
                      key={g.value}
                      type="button"
                      className="brain-empty-chip"
                      onClick={() => startAdd(g.value)}
                      title={g.blurb}
                      data-testid={`button-add-empty-${g.value}`}
                    >
                      <Icon size={13} aria-hidden />
                      {g.label}
                      <span aria-hidden className="faint"> +</span>
                    </button>
                  ) : (
                    <span key={g.value} className="brain-empty-chip">
                      <Icon size={13} aria-hidden />
                      {g.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
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
  item: BrainManagerItem;
  propertyId: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="brain-item" id={`brain-item-${item.id}`} data-testid={`card-brain-${item.id}`}>
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
          <button className="btn btn-ghost btn-sm" onClick={onEdit} data-testid={`button-edit-${item.id}`}>
            Edit
          </button>
          <form action={deleteBrainItemAction}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="itemId" value={item.id} />
            <button
              className="btn btn-ghost btn-sm"
              type="submit"
              style={{ color: 'var(--coral)' }}
              data-testid={`button-delete-${item.id}`}
            >
              Delete
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function BrainItemForm({
  propertyId,
  sections,
  item,
  defaultSection,
  inline = false,
  onDone,
}: {
  propertyId: string;
  sections: BrainManagerSection[];
  item: BrainManagerItem | null;
  defaultSection: string;
  inline?: boolean;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<BrainActionState, FormData>(saveBrainItemAction, {});
  if (state.ok) queueMicrotask(onDone);

  // Ids must be unique per form: several of these can be mounted at once now that the
  // editor is inline, and duplicate ids would send every label to the first field.
  const uid = item ? `edit-${item.id}` : `new-${defaultSection}`;
  const fieldId = (name: string) => `brain-${name}-${uid}`;

  const body = (
    <>
      <div className="brain-item-inline-head">
        <h4>{item ? 'Edit knowledge' : 'Add knowledge'}</h4>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <div className="field">
        <label className="label" htmlFor={fieldId('title')}>Title</label>
        <input
          className="input"
          id={fieldId('title')}
          name="title"
          defaultValue={item?.title ?? ''}
          maxLength={200}
          required
          data-testid="input-brain-title"
        />
      </div>
      <div className="brain-form-grid">
        <div className="field">
          <label className="label" htmlFor={fieldId('section')}>Section</label>
          <select
            className="select"
            id={fieldId('section')}
            name="section"
            defaultValue={item?.section ?? defaultSection}
            data-testid="select-brain-category"
          >
            {sections.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={fieldId('visibility')}>Visibility</label>
          <select
            className="select"
            id={fieldId('visibility')}
            name="visibility"
            defaultValue={item?.visibility ?? 'guest'}
            data-testid="select-brain-visibility"
          >
            <option value="guest">Guests can see</option>
            <option value="internal">Host-only (never shown to guests)</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor={fieldId('body')}>Details</label>
        <textarea
          className="textarea"
          id={fieldId('body')}
          name="body"
          defaultValue={item?.body ?? ''}
          rows={inline ? 5 : 6}
          maxLength={20000}
          placeholder="e.g. Network name: Cottage_5G — password lives in the welcome binder"
          data-testid="input-brain-body"
        />
      </div>
      <SubmitButton>{item ? 'Save changes' : 'Add to Brain'}</SubmitButton>
    </>
  );

  if (inline) {
    return (
      <form action={formAction} className="brain-item-inline-form">
        {body}
      </form>
    );
  }
  return (
    <form
      action={formAction}
      id="brain-editor"
      className="card"
      style={{ padding: '1.5rem', marginBottom: '1rem', borderColor: 'var(--teal-deep)' }}
    >
      {body}
    </form>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
