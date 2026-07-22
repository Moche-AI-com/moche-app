'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { PremiumImage } from '@/components/PremiumImage';
import {
  createUpsellAction, updateUpsellAction, toggleUpsellAction, deleteUpsellAction,
  type UpsellFormState,
} from './actions';

export interface UpsellRow {
  id: string;
  title: string;
  description: string | null;
  price_text: string | null;
  cta_label: string | null;
  active: boolean;
  sort_order: number;
}

export function UpsellManager({ propertyId, offers }: { propertyId: string; offers: UpsellRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem' }}>Enhancements &amp; upsells</h2>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
            Offers your guests can request from the portal (late checkout, mid-stay clean, airport transfer…).
            A request reaches you through your usual escalations and notifications.
          </p>
        </div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditingId(null); }} data-testid="button-add-upsell">
            <Plus size={15} aria-hidden style={{ marginRight: '.35rem' }} /> Add offer
          </button>
        )}
      </div>

      {adding && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <OfferForm propertyId={propertyId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {offers.length === 0 && !adding ? (
        <div className="card card-2" style={{ padding: 0, overflow: 'hidden', textAlign: 'center' }} data-testid="upsells-empty">
          <PremiumImage src="/premium/upsells-empty.jpg" alt="" aspectRatio="16 / 5" radius={0} sizes="(max-width: 900px) 100vw, 900px" />
          <div style={{ padding: '1.5rem' }}>
            <p className="muted" style={{ fontSize: '.9rem' }}>No offers yet. Add your first enhancement to start upselling.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }} data-testid="upsells-list">
          {offers.map((offer) => (
            <div key={offer.id} className="card" style={{ padding: '1.1rem' }} data-testid={`upsell-row-${offer.id}`}>
              {editingId === offer.id ? (
                <OfferForm propertyId={propertyId} offer={offer} onDone={() => setEditingId(null)} onCancel={() => setEditingId(null)} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.85rem' }}>
                  <GripVertical size={16} aria-hidden className="faint" style={{ marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.98rem' }}>{offer.title}</strong>
                      {offer.price_text && <span className="badge badge-teal">{offer.price_text}</span>}
                      <span className={`badge ${offer.active ? 'badge-teal' : 'badge-coral'}`}>{offer.active ? 'Active' : 'Paused'}</span>
                    </div>
                    {offer.description && <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>{offer.description}</p>}
                    <p className="faint" style={{ fontSize: '.75rem', marginTop: '.35rem' }}>CTA: {offer.cta_label || 'Request'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
                    <form action={toggleUpsellAction}>
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="offerId" value={offer.id} />
                      <input type="hidden" name="active" value={(!offer.active).toString()} />
                      <button type="submit" className="btn btn-ghost btn-sm" data-testid={`button-toggle-upsell-${offer.id}`}>
                        {offer.active ? 'Pause' : 'Activate'}
                      </button>
                    </form>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(offer.id); setAdding(false); }} aria-label="Edit offer" data-testid={`button-edit-upsell-${offer.id}`}>
                      <Pencil size={14} aria-hidden />
                    </button>
                    <form action={deleteUpsellAction} onSubmit={(e) => { if (!confirm('Delete this offer?')) e.preventDefault(); }}>
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="offerId" value={offer.id} />
                      <button type="submit" className="btn btn-ghost btn-sm" aria-label="Delete offer" data-testid={`button-delete-upsell-${offer.id}`}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </form>
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

function OfferForm({ propertyId, offer, onDone, onCancel }: { propertyId: string; offer?: UpsellRow; onDone: () => void; onCancel: () => void }) {
  const action = offer ? updateUpsellAction : createUpsellAction;
  const [state, formAction] = useFormState<UpsellFormState, FormData>(action, {});
  // Close the inline form once the server action reports success.
  if (state.success) setTimeout(onDone, 0);

  return (
    <form action={formAction} data-testid={offer ? 'form-edit-upsell' : 'form-add-upsell'}>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {offer && <input type="hidden" name="offerId" value={offer.id} />}

      <label className="label">Title</label>
      <input name="title" className="input" defaultValue={offer?.title ?? ''} placeholder="Late checkout" required maxLength={120} data-testid="input-upsell-title" />

      <label className="label" style={{ marginTop: '.75rem' }}>Description</label>
      <textarea name="description" className="input" defaultValue={offer?.description ?? ''} placeholder="Stay until 2pm — we'll skip the rush." rows={2} maxLength={1000} data-testid="input-upsell-description" />

      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">Price text</label>
          <input name="priceText" className="input" defaultValue={offer?.price_text ?? ''} placeholder="$35" maxLength={60} data-testid="input-upsell-price" />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">CTA label</label>
          <input name="ctaLabel" className="input" defaultValue={offer?.cta_label ?? 'Request'} placeholder="Request" maxLength={40} data-testid="input-upsell-cta" />
        </div>
        <div style={{ width: 110 }}>
          <label className="label">Sort</label>
          <input name="sortOrder" type="number" className="input" defaultValue={offer?.sort_order ?? 0} min={0} max={9999} data-testid="input-upsell-sort" />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.85rem 0', fontSize: '.88rem', cursor: 'pointer' }}>
        <input type="checkbox" name="active" defaultChecked={offer ? offer.active : true} data-testid="checkbox-upsell-active" />
        <span>Active (visible to guests)</span>
      </label>

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <SubmitButton className="btn btn-primary btn-sm" testId="button-save-upsell">{offer ? 'Save offer' : 'Add offer'}</SubmitButton>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} data-testid="button-cancel-upsell">Cancel</button>
      </div>
    </form>
  );
}
