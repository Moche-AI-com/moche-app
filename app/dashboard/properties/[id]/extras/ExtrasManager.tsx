'use client';

import { useState, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import {
  EXTRAS_CATEGORIES, extraCategory, extraQuantityCeiling, normalizeExtraCategory,
  isPackageExtra, normalizeExtraOptions, MAX_EXTRA_OPTIONS,
} from '@/lib/guest/extras';
import { PremiumImage } from '@/components/PremiumImage';
import {
  createExtraAction, updateExtraAction, toggleExtraAction, deleteExtraAction,
  type ExtraFormState,
} from './actions';

export interface ExtraRow {
  id: string;
  title: string;
  description: string | null;
  price_text: string | null;
  cta_label: string | null;
  active: boolean;
  sort_order: number;
  category: string | null;
  is_favorite: boolean;
  max_quantity: number | null;
  kind: string | null;
  unit_label: string | null;
  option_label: string | null;
  options: string[] | null;
  details: string | null;
}

export function ExtrasManager({ propertyId, offers }: { propertyId: string; offers: ExtraRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem' }}>Extras</h2>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
            Offers your guests can request from the portal (late checkout, mid-stay clean, airport transfer…).
            A request lands in your Host Chat thread with the guest and in your Extras queue. Add options
            (blue bike / pink bike) and a unit (&ldquo;towels&rdquo;) so a request tells you exactly what to bring.
          </p>
        </div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditingId(null); }} data-testid="button-add-extra">
            <Plus size={15} aria-hidden style={{ marginRight: '.35rem' }} /> Add offer
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '.85rem 1rem', marginBottom: '1rem', borderLeft: '3px solid var(--teal)' }}>
        <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
          Moche-AI never charges your guest or collects payment for these offers — you arrange payment and
          fulfillment directly with the guest. These tools keep the requests organized; the work stays yours.
        </p>
      </div>

      {adding && <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}><OfferForm propertyId={propertyId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} /></div>}

      {offers.length === 0 && !adding ? (
        <div className="card card-2" style={{ padding: 0, overflow: 'hidden', textAlign: 'center' }} data-testid="extras-empty">
          <PremiumImage src="/premium/extras-empty.jpg" alt="" aspectRatio="16 / 5" radius={0} sizes="(max-width: 900px) 100vw, 900px" />
          <div style={{ padding: '1.5rem' }}><p className="muted" style={{ fontSize: '.9rem' }}>No extras yet. Add your first one so guests can request it from the portal.</p></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }} data-testid="extras-list">
          {offers.map((offer) => (
            <div key={offer.id} className="card" style={{ padding: '1.1rem' }} data-testid={`extra-row-${offer.id}`}>
              {editingId === offer.id ? <OfferForm propertyId={propertyId} offer={offer} onDone={() => setEditingId(null)} onCancel={() => setEditingId(null)} /> : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.85rem' }}>
                  <GripVertical size={16} aria-hidden className="faint" style={{ marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.98rem' }}>{offer.title}</strong>
                      {offer.price_text && <span className="badge badge-teal">{offer.price_text}</span>}
                      <span className={`badge ${offer.active ? 'badge-teal' : 'badge-coral'}`}>{offer.active ? 'Active' : 'Paused'}</span>
                      <span className="badge">{extraCategory(normalizeExtraCategory(offer.category)).label}</span>
                      {offer.is_favorite && <span className="badge badge-teal" data-testid={`extra-featured-${offer.id}`}>Featured</span>}
                      {isPackageExtra(offer.kind) && <span className="badge" data-testid={`extra-kind-${offer.id}`}>Package</span>}
                    </div>
                    {offer.description && <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>{offer.description}</p>}
                    <p className="faint" style={{ fontSize: '.75rem', marginTop: '.35rem' }}>
                      CTA: {offer.cta_label || 'Request'}
                      {!isPackageExtra(offer.kind) && offer.max_quantity ? ` · Max ${offer.max_quantity} per request` : ''}
                      {!isPackageExtra(offer.kind) && offer.unit_label ? ` · Unit: ${offer.unit_label}` : ''}
                      {normalizeExtraOptions(offer.options).length > 0 ? ` · ${offer.option_label || 'Options'}: ${normalizeExtraOptions(offer.options).join(', ')}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
                    <form action={toggleExtraAction}><input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="active" value={(!offer.active).toString()} /><button type="submit" className="btn btn-ghost btn-sm" data-testid={`button-toggle-extra-${offer.id}`}>{offer.active ? 'Pause' : 'Activate'}</button></form>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(offer.id); setAdding(false); }} aria-label="Edit offer" data-testid={`button-edit-extra-${offer.id}`}><Pencil size={14} aria-hidden /></button>
                    <form action={deleteExtraAction} onSubmit={(e) => { if (!confirm('Delete this offer?')) e.preventDefault(); }}><input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="offerId" value={offer.id} /><button type="submit" className="btn btn-ghost btn-sm" aria-label="Delete offer" data-testid={`button-delete-extra-${offer.id}`}><Trash2 size={14} aria-hidden /></button></form>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em', margin: '1rem 0 .4rem' }}>{children}</p>;
}

function OfferForm({ propertyId, offer, onDone, onCancel }: { propertyId: string; offer?: ExtraRow; onDone: () => void; onCancel: () => void }) {
  const action = offer ? updateExtraAction : createExtraAction;
  const [state, formAction] = useFormState<ExtraFormState, FormData>(action, {});
  const [kind, setKind] = useState<'quantity' | 'package'>(isPackageExtra(offer?.kind) ? 'package' : 'quantity');
  const isPackage = kind === 'package';
  if (state.success) setTimeout(onDone, 0);

  return (
    <form action={formAction} data-testid={offer ? 'form-edit-extra' : 'form-add-extra'}>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {offer && <input type="hidden" name="offerId" value={offer.id} />}

      <SectionLabel>What it is</SectionLabel>
      <label className="label">Title</label><input name="title" className="input" defaultValue={offer?.title ?? ''} placeholder="Late checkout" required maxLength={120} data-testid="input-extra-title" />
      <label className="label" style={{ marginTop: '.75rem' }}>Description</label><textarea name="description" className="input" defaultValue={offer?.description ?? ''} placeholder="Stay until 2pm — we'll skip the rush." rows={2} maxLength={1000} data-testid="input-extra-description" />
      <label className="label" style={{ marginTop: '.75rem' }}>Category</label>
      <select name="category" className="select" defaultValue={offer?.category ?? ''} data-testid="select-extra-category"><option value="">Uncategorized (shows under &ldquo;More&rdquo;)</option>{EXTRAS_CATEGORIES.filter((c) => c.id !== 'more').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      <p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Guests browse by category first, so grouping helps once you have more than a few.</p>

      <SectionLabel>What it costs</SectionLabel>
      <label className="label">Price text</label><input name="priceText" className="input" defaultValue={offer?.price_text ?? ''} placeholder="$35" maxLength={60} data-testid="input-extra-price" />
      <p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Shown to guests as text only — Moche never collects payment. You arrange it directly with the guest.</p>

      <SectionLabel>How many</SectionLabel>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }} role="radiogroup" aria-label="Offer type">
        {[{ id: 'quantity' as const, label: 'Countable item', hint: 'Guests choose how many — towels, beach chairs, bikes.' }, { id: 'package' as const, label: 'Package', hint: 'One bundle bought as-is — golf package, wedding package.' }].map((opt) => (
          <label key={opt.id} style={{ flex: 1, minWidth: 220, display: 'flex', gap: '.55rem', alignItems: 'flex-start', padding: '.7rem .8rem', borderRadius: 10, cursor: 'pointer', border: `1px solid ${kind === opt.id ? 'var(--accent, #c9a96e)' : 'var(--line, rgba(0,0,0,.14))'}` }}>
            <input type="radio" name="kind" value={opt.id} checked={kind === opt.id} onChange={() => setKind(opt.id)} data-testid={`radio-extra-kind-${opt.id}`} style={{ marginTop: 3 }} />
            <span><strong style={{ fontSize: '.88rem', display: 'block' }}>{opt.label}</strong><span className="faint" style={{ fontSize: '.75rem' }}>{opt.hint}</span></span>
          </label>
        ))}
      </div>
      {!isPackage && <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
        <div style={{ width: 150 }}><label className="label">Max per request</label><input name="maxQuantity" type="number" className="input" defaultValue={offer?.max_quantity ?? ''} min={1} max={10} placeholder="Any" data-testid="input-extra-max-quantity" /><p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Leave blank for up to {extraQuantityCeiling(null)}.</p></div>
        <div style={{ width: 170 }}><label className="label">Unit</label><input name="unitLabel" className="input" defaultValue={offer?.unit_label ?? ''} placeholder="towels" maxLength={40} data-testid="input-extra-unit-label" /><p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Guests see &ldquo;2 towels&rdquo; instead of a bare &ldquo;2&rdquo;.</p></div>
      </div>}
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
        <div style={{ width: 180 }}><label className="label">Options label</label><input name="optionLabel" className="input" defaultValue={offer?.option_label ?? ''} placeholder="Colour" maxLength={60} data-testid="input-extra-option-label" /></div>
        <div style={{ flex: 1, minWidth: 240 }}><label className="label">Options (one per line)</label><textarea name="options" className="input" defaultValue={(offer?.options ?? []).join('\n')} placeholder={'Blue bike\nPink bike'} rows={3} maxLength={1000} data-testid="input-extra-options" /><p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Leave blank if there is nothing to choose between. Up to {MAX_EXTRA_OPTIONS}; guests must pick one before requesting.</p></div>
      </div>

      <SectionLabel>What&apos;s included</SectionLabel>
      <textarea name="details" className="input" defaultValue={offer?.details ?? ''} placeholder={isPackage ? '18 holes for two, cart, and club hire. Book 24h ahead.' : 'Fresh set delivered to your door within the hour.'} rows={3} maxLength={2000} data-testid="input-extra-details" />
      <p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>Shown to guests when they open the offer, so they know exactly what they are getting.</p>

      <SectionLabel>How it shows</SectionLabel>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}><div style={{ flex: 1, minWidth: 140 }}><label className="label">CTA label</label><input name="ctaLabel" className="input" defaultValue={offer?.cta_label ?? 'Request'} placeholder="Request" maxLength={40} data-testid="input-extra-cta" /></div><div style={{ width: 110 }}><label className="label">Sort</label><input name="sortOrder" type="number" className="input" defaultValue={offer?.sort_order ?? 0} min={0} max={9999} data-testid="input-extra-sort" /></div></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.85rem 0 0', fontSize: '.88rem', cursor: 'pointer' }}><input type="checkbox" name="isFavorite" defaultChecked={offer?.is_favorite ?? false} data-testid="checkbox-extra-favorite" /><span>Feature this first in the guest list</span></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.85rem 0', fontSize: '.88rem', cursor: 'pointer' }}><input type="checkbox" name="active" defaultChecked={offer ? offer.active : true} data-testid="checkbox-extra-active" /><span>Active (visible to guests)</span></label>
      <div style={{ display: 'flex', gap: '.5rem' }}><SubmitButton className="btn btn-primary btn-sm" testId="button-save-extra">{offer ? 'Save offer' : 'Add offer'}</SubmitButton><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} data-testid="button-cancel-extra">Cancel</button></div>
    </form>
  );
}
