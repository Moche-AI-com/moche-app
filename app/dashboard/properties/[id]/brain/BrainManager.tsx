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
//   5. Spaces & features (2026-08-28). Custom features render as their own groups after
//      the canonical sections — a feature group always renders, even empty, because the
//      feature IS the section and its location/access summary is the orientation. The
//      add form's section select gains a "Spaces & features" optgroup; choosing one
//      stores brain_items.feature_id (see actions.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import {
  Wifi, KeyRound, Banknote, Home, Car, Cpu, MapPin, ScrollText, LogOut, Siren, BookOpen,
  Waves, Flame, Zap, Anchor, Warehouse, ThermometerSun, Gamepad2, Dumbbell, Sun, Flower2,
  Bike, Sailboat, Umbrella, Briefcase, Baby, Star,
} from 'lucide-react';
import { saveBrainItemAction, deleteBrainItemAction, type BrainActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';
import { featureSectionId, type PropertyFeature } from '@/lib/brain/taxonomy';

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
  /** Set when the item is filed under a custom feature (Spaces & features). */
  featureId?: string | null;
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

// Feature-group icons, keyed by catalog key. Anything freeform falls back to Star —
// a feature the host named themselves should still read as theirs, not as a book.
const FEATURE_ICON: Record<string, typeof Home> = {
  pool: Waves,
  hot_tub: Waves,
  grill: Flame,
  ev_charger: Zap,
  fireplace: Flame,
  fire_pit: Flame,
  deck_patio: Sun,
  garden: Flower2,
  game_room: Gamepad2,
  gym: Dumbbell,
  sauna: ThermometerSun,
  bikes: Bike,
  beach_gear: Umbrella,
  kayaks: Sailboat,
  dock: Anchor,
  workspace: Briefcase,
  crib_kids: Baby,
  shed: Warehouse,
};

const FEATURE_ACCESS_BLURB: Record<PropertyFeature['guestAccess'], string> = {
  yes: 'Guests may use it',
  supervised: 'Guests use it with the host’s OK / supervision',
  no: 'Not for guest use',
};

/** The feature card's orientation line: its structured inputs, so the group is
    informative even before any knowledge is filed under it. */
function featureBlurb(f: PropertyFeature): string {
  const head = [f.location ? `Where: ${f.location}` : null, FEATURE_ACCESS_BLURB[f.guestAccess]]
    .filter(Boolean)
    .join(' · ');
  return f.notes ? `${head} — ${f.notes}` : head;
}

interface BrainGroup {
  value: string;
  label: string;
  blurb: string;
  items: BrainManagerItem[];
  /** True for custom features: always rendered (the feature is the section), and
      excluded from the "nothing filed here" chips, which are canonical-section only. */
  feature?: PropertyFeature;
}

export function BrainManager({
  propertyId,
  canEdit,
  sections,
  items,
  features = [],
  defaultSection,
  editItemId,
}: {
  propertyId: string;
  canEdit: boolean;
  sections: BrainManagerSection[];
  items: BrainManagerItem[];
  features?: PropertyFeature[];
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
    // Feature-filed items group under their feature's pseudo section id; everything
    // else groups under its canonical section.
    const groupKeyOf = (it: BrainManagerItem) =>
      it.featureId ? featureSectionId(it.featureId) : it.section;
    const byGroup = new Map<string, BrainManagerItem[]>();
    for (const it of items) {
      const k = groupKeyOf(it);
      const arr = byGroup.get(k) ?? [];
      arr.push(it);
      byGroup.set(k, arr);
    }
    const groups: BrainGroup[] = sections.map((s) => ({
      value: s.value,
      label: s.label,
      blurb: s.blurb,
      items: byGroup.get(s.value) ?? [],
    }));
    // Custom features follow the canonical sections, in creation order.
    for (const f of features) {
      groups.push({
        value: featureSectionId(f.id),
        label: f.label,
        blurb: featureBlurb(f),
        items: byGroup.get(featureSectionId(f.id)) ?? [],
        feature: f,
      });
    }
    // Anything resolving to a group the caller did not offer still has to render. An
    // item silently missing from this list is worse than an oddly-labelled group, and
    // it is the failure mode when the offered section set is narrowed.
    const known = new Set(groups.map((g) => g.value));
    for (const [key, arr] of byGroup) {
      if (known.has(key)) continue;
      groups.push({ value: key, label: 'Unsorted', blurb: 'Move these into a section.', items: arr });
    }
    return {
      filled: groups.filter((g) => g.items.length > 0 || g.feature),
      empty: groups.filter((g) => g.items.length === 0 && !g.feature && sections.some((s) => s.value === g.value)),
    };
  }, [items, sections, features]);

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
          features={features}
          item={null}
          defaultSection={addingIn}
          onDone={() => setAddingIn(null)}
          key={`new-${addingIn}`}
        />
      )}

      {items.length === 0 && features.length === 0 && addingIn === null ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">
            No knowledge yet. Wi-Fi, check-in, and house rules are the three your guests ask about
            first — start there.
          </p>
        </div>
      ) : (
        <div className="brain-groups">
          {filled.map((group) => {
            const Icon = group.feature
              ? FEATURE_ICON[group.feature.catalogKey ?? ''] ?? Star
              : SECTION_ICON[group.value] ?? BookOpen;
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
                            features={features}
                            item={it}
                            defaultSection={it.featureId ? featureSectionId(it.featureId) : it.section}
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
  features,
  item,
  defaultSection,
  inline = false,
  onDone,
}: {
  propertyId: string;
  sections: BrainManagerSection[];
  features: PropertyFeature[];
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
            defaultValue={item ? (item.featureId ? featureSectionId(item.featureId) : item.section) : defaultSection}
            data-testid="select-brain-category"
          >
            {sections.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            {features.length > 0 && (
              <optgroup label="Spaces & features">
                {features.map((f) => (
                  <option key={f.id} value={featureSectionId(f.id)}>{f.label}</option>
                ))}
              </optgroup>
            )}
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
