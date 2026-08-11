'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ClipboardList, Gift, Loader2, XCircle } from 'lucide-react';
import { EXTRAS_STATUS_LABEL, type ExtrasFulfillmentStatus } from '@/lib/extras/lifecycle';
import { clampExtraQuantity, DEFAULT_EXTRA_QUANTITY, isPackageExtra, normalizeExtraOptions } from '@/lib/guest/extras';

export type GuestExtraOffer = {
  id: string;
  title: string;
  description: string | null;
  details: string | null;
  price_text: string | null;
  cta_label: string | null;
  category: string | null;
  max_quantity: number | null;
  kind: string | null;
  unit_label: string | null;
  option_label: string | null;
  options: string[] | null;
};

type GuestOrder = {
  id: string;
  request_number: string;
  item_title: string;
  item_price_text: string | null;
  item_variant: string | null;
  quantity: number;
  guest_note: string | null;
  host_note: string | null;
  fulfillment_status: ExtrasFulfillmentStatus;
  quoted_amount_cents: number | null;
  quote_currency: string;
  payment_mode: string;
  scheduled_for: string | null;
  declined_reason: string | null;
  created_at: string;
};

type OrderEvent = {
  id: string;
  order_id: string;
  from_status: ExtrasFulfillmentStatus | null;
  to_status: ExtrasFulfillmentStatus;
  actor_type: 'guest' | 'host' | 'system';
  note: string | null;
  created_at: string;
};

type Flow = 'landing' | 'detail' | 'form' | 'review' | 'confirmation' | 'requests' | 'request_detail';

export function GuestExtrasExperience({
  slug,
  propertyName,
  offers,
}: {
  slug: string;
  propertyName: string;
  offers: GuestExtraOffer[];
}) {
  const [flow, setFlow] = useState<Flow>('landing');
  const [offer, setOffer] = useState<GuestExtraOffer | null>(null);
  const [quantity, setQuantity] = useState(DEFAULT_EXTRA_QUANTITY);
  const [variant, setVariant] = useState('');
  const [note, setNote] = useState('');
  const [preferredFor, setPreferredFor] = useState('');
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [detailsReply, setDetailsReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const variants = useMemo(() => normalizeExtraOptions(offer?.options), [offer?.options]);
  const activeOrder = orders.find((item) => item.id === activeOrderId) ?? null;
  const activeEvents = events.filter((event) => event.order_id === activeOrderId);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/guest/${slug}/extras-orders`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not load your requests.');
      setOrders(body.orders ?? []);
      setEvents(body.events ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (flow === 'requests' || flow === 'request_detail') void loadRequests();
  }, [flow, loadRequests]);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [flow]);

  function chooseOffer(nextOffer: GuestExtraOffer) {
    setOffer(nextOffer);
    setQuantity(DEFAULT_EXTRA_QUANTITY);
    setVariant('');
    setNote('');
    setPreferredFor('');
    setError(null);
    setFlow('detail');
  }

  function toReview() {
    if (!offer) return;
    if (!isPackageExtra(offer.kind) && variants.length && !variant) {
      setError(`Choose a ${offer.option_label || 'option'} before continuing.`);
      return;
    }
    setError(null);
    setFlow('review');
  }

  async function submitRequest() {
    if (!offer) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/guest/${slug}/extras-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offer.id,
          quantity: isPackageExtra(offer.kind) ? 1 : quantity,
          variant: variant || undefined,
          note: note.trim() || undefined,
          preferredFor: preferredFor ? new Date(preferredFor).toISOString() : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not send your request.');
      setRequestNumber(body.requestNumber);
      setFlow('confirmation');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send your request.');
    } finally {
      setLoading(false);
    }
  }

  async function updateOrder(action: 'supply_details' | 'cancel') {
    if (!activeOrder) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/guest/${slug}/extras-orders/${activeOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: action === 'supply_details' ? detailsReply.trim() : undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not update your request.');
      setDetailsReply('');
      await loadRequests();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update your request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 56px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/g/${slug}`} className="btn btn-ghost btn-sm"><ArrowLeft size={16} aria-hidden /> Guide</Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlow('requests')}>
          <ClipboardList size={16} aria-hidden /> My requests
        </button>
      </header>

      {error && <p role="alert" className="alert alert-error" style={{ marginBottom: 16 }}>{error}</p>}
      <p aria-live="polite" className="faint" style={{ minHeight: 1, margin: 0 }}>
        {loading ? 'Updating your request…' : flow === 'confirmation' ? 'Your request was saved.' : ''}
      </p>

      {flow === 'landing' && (
        <>
          <p className="faint" style={{ margin: 0, fontSize: '.8rem' }}>{propertyName}</p>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: 'clamp(1.75rem, 7vw, 2.35rem)', margin: '4px 0 10px' }}>Make your stay easier</h1>
          <p className="muted" style={{ margin: 0 }}>Browse optional extras and send a request to your host.</p>
          <p className="faint" style={{ fontSize: '.82rem', marginTop: 10 }}>Requests only. No card will be charged in Moche.</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
            {offers.map((item) => (
              <button key={item.id} type="button" onClick={() => chooseOffer(item)} className="card" style={{ textAlign: 'left', padding: 20, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                  <div><Gift size={18} aria-hidden style={{ color: 'var(--accent, #a1763d)' }} /><h2 style={{ fontSize: '1.05rem', margin: '8px 0 4px' }}>{item.title}</h2></div>
                  {item.price_text && <span className="badge badge-teal">{item.price_text}</span>}
                </div>
                {item.description && <p className="muted" style={{ margin: '6px 0 0', fontSize: '.9rem' }}>{item.description}</p>}
              </button>
            ))}
          </div>
          {offers.length === 0 && <div className="card" style={{ padding: 24, marginTop: 24, textAlign: 'center' }}><p className="muted">There are no extras available right now.</p></div>}
        </>
      )}

      {flow === 'detail' && offer && (
        <section className="card" style={{ padding: 24 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlow('landing')}><ArrowLeft size={15} aria-hidden /> All extras</button>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ margin: '20px 0 6px', fontSize: '1.65rem' }}>{offer.title}</h1>
          {offer.price_text && <p className="badge badge-teal" style={{ display: 'inline-block' }}>{offer.price_text}</p>}
          <p className="muted">{offer.details || offer.description || 'Ask your host to arrange this extra for your stay.'}</p>
          <p className="faint" style={{ fontSize: '.82rem' }}>Your host will confirm availability and any arrangements. Moche will not charge a card.</p>
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setFlow('form')}>
            {offer.cta_label || 'Request this extra'}
          </button>
        </section>
      )}

      {flow === 'form' && offer && (
        <section className="card" style={{ padding: 24 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlow('detail')}><ArrowLeft size={15} aria-hidden /> Back</button>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: '1.4rem', margin: '20px 0 4px' }}>Request {offer.title}</h1>
          {!isPackageExtra(offer.kind) && (
            <label className="label" style={{ marginTop: 18 }}>How many{offer.unit_label ? ` ${offer.unit_label}` : ''}?</label>
          )}
          {!isPackageExtra(offer.kind) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" className="btn btn-ghost" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <strong aria-live="polite">{quantity}</strong>
              <button type="button" className="btn btn-ghost" aria-label="Increase quantity" onClick={() => setQuantity((value) => clampExtraQuantity(value + 1, offer.max_quantity))}>+</button>
            </div>
          )}
          {variants.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
              <legend className="label">{offer.option_label || 'Choose an option'}</legend>
              <div style={{ display: 'grid', gap: 8 }}>
                {variants.map((option) => <label key={option} className="card" style={{ padding: 12, cursor: 'pointer' }}><input type="radio" name="variant" checked={variant === option} onChange={() => setVariant(option)} /> <span style={{ marginLeft: 8 }}>{option}</span></label>)}
              </div>
            </fieldset>
          )}
          <label className="label" style={{ marginTop: 20 }}>Anything your host should know? <span className="faint">(optional)</span></label>
          <textarea className="input" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example, where to leave it or timing preferences" />
          <label className="label" style={{ marginTop: 20 }}>Preferred time <span className="faint">(optional)</span></label>
          <input className="input" type="datetime-local" value={preferredFor} onChange={(event) => setPreferredFor(event.target.value)} />
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 24 }} onClick={toReview}>Review request</button>
        </section>
      )}

      {flow === 'review' && offer && (
        <section className="card" style={{ padding: 24 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlow('form')}><ArrowLeft size={15} aria-hidden /> Edit</button>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: '1.4rem', margin: '20px 0 14px' }}>Review your request</h1>
          <dl style={{ display: 'grid', gap: 12, margin: 0 }}>
            <div><dt className="faint">Extra</dt><dd style={{ margin: 0, fontWeight: 700 }}>{offer.title}</dd></div>
            <div><dt className="faint">Estimate, your host will confirm</dt><dd style={{ margin: 0 }}>{offer.price_text || 'Your host will confirm any estimate.'}</dd></div>
            {!isPackageExtra(offer.kind) && <div><dt className="faint">Quantity</dt><dd style={{ margin: 0 }}>{quantity}{offer.unit_label ? ` ${offer.unit_label}` : ''}</dd></div>}
            {variant && <div><dt className="faint">{offer.option_label || 'Option'}</dt><dd style={{ margin: 0 }}>{variant}</dd></div>}
            {note && <div><dt className="faint">Note</dt><dd style={{ margin: 0 }}>{note}</dd></div>}
            {preferredFor && <div><dt className="faint">Preferred time</dt><dd style={{ margin: 0 }}>{new Date(preferredFor).toLocaleString()}</dd></div>}
          </dl>
          <p className="faint" style={{ fontSize: '.82rem', marginTop: 20 }}>This sends a request to your host. It does not place a charge or collect payment.</p>
          <button type="button" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={submitRequest}>
            {loading ? <><Loader2 className="spin" size={16} aria-hidden /> Sending</> : 'Send request'}
          </button>
        </section>
      )}

      {flow === 'confirmation' && (
        <section className="card" style={{ padding: 28, textAlign: 'center' }}>
          <CheckCircle2 size={42} aria-hidden style={{ color: 'var(--teal, #0b8b79)' }} />
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: '1.5rem', margin: '14px 0 6px' }}>Request received</h1>
          <p className="muted">Your host will review the request and let you know what they can arrange.</p>
          {requestNumber && <p style={{ fontWeight: 700, letterSpacing: '.04em' }}>Reference: {requestNumber}</p>}
          <p className="faint" style={{ fontSize: '.82rem' }}>No card has been charged.</p>
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setFlow('requests')}>Track this request</button>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setFlow('landing')}>Browse more extras</button>
        </section>
      )}

      {flow === 'requests' && (
        <section>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: '1.55rem', margin: 0 }}>My requests</h1>
          <p className="muted" style={{ marginTop: 6 }}>Track your requests and any updates from your host.</p>
          {loading && <p className="faint">Loading requests…</p>}
          <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
            {orders.map((item) => <button type="button" key={item.id} className="card" style={{ textAlign: 'left', padding: 18, cursor: 'pointer' }} onClick={() => { setActiveOrderId(item.id); setFlow('request_detail'); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{item.item_title}</strong><span className="badge">{EXTRAS_STATUS_LABEL[item.fulfillment_status]}</span></div>
              <p className="faint" style={{ margin: '7px 0 0', fontSize: '.8rem' }}>{item.request_number} · {new Date(item.created_at).toLocaleDateString()}</p>
            </button>)}
          </div>
          {!loading && orders.length === 0 && <div className="card" style={{ padding: 24, marginTop: 20, textAlign: 'center' }}><p className="muted">You have not requested any extras yet.</p><button type="button" className="btn btn-primary" onClick={() => setFlow('landing')}>Browse extras</button></div>}
        </section>
      )}

      {flow === 'request_detail' && activeOrder && (
        <section className="card" style={{ padding: 24 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlow('requests')}><ArrowLeft size={15} aria-hidden /> My requests</button>
          <h1 ref={stepHeadingRef} tabIndex={-1} style={{ fontSize: '1.4rem', margin: '20px 0 4px' }}>{activeOrder.item_title}</h1>
          <p className="faint" style={{ margin: 0 }}>{activeOrder.request_number}</p>
          <p><span className="badge">{EXTRAS_STATUS_LABEL[activeOrder.fulfillment_status]}</span></p>
          {activeOrder.host_note && <div className="alert alert-info"><strong>Host update</strong><br />{activeOrder.host_note}</div>}
          {activeOrder.declined_reason && <div className="alert alert-error"><strong>Host update</strong><br />{activeOrder.declined_reason}</div>}
          {activeOrder.scheduled_for && <p><strong>Scheduled for:</strong> {new Date(activeOrder.scheduled_for).toLocaleString()}</p>}
          {activeOrder.quoted_amount_cents !== null && <p className="faint">Estimated amount: {(activeOrder.quoted_amount_cents / 100).toFixed(2)} {activeOrder.quote_currency.toUpperCase()}. Any payment is arranged directly with your host, outside Moche.</p>}
          <h2 style={{ fontSize: '1rem', marginTop: 24 }}>Timeline</h2>
          <ol style={{ display: 'grid', gap: 12, paddingLeft: 20 }}>
            {activeEvents.map((event) => <li key={event.id}><strong>{EXTRAS_STATUS_LABEL[event.to_status]}</strong><br /><span className="faint" style={{ fontSize: '.8rem' }}>{new Date(event.created_at).toLocaleString()} · {event.actor_type === 'host' ? 'Host' : event.actor_type === 'guest' ? 'You' : 'System'}</span>{event.note && <p style={{ margin: '3px 0 0' }}>{event.note}</p>}</li>)}
          </ol>
          {activeOrder.fulfillment_status === 'needs_details' && <div style={{ marginTop: 24 }}><label className="label">Reply to your host</label><textarea className="input" rows={3} value={detailsReply} onChange={(event) => setDetailsReply(event.target.value)} maxLength={1000} /><button type="button" disabled={!detailsReply.trim() || loading} className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => updateOrder('supply_details')}>Send details</button></div>}
          {(activeOrder.fulfillment_status === 'requested' || activeOrder.fulfillment_status === 'needs_details') && <button type="button" disabled={loading} className="btn btn-ghost" style={{ color: 'var(--coral)', marginTop: 24 }} onClick={() => updateOrder('cancel')}><XCircle size={16} aria-hidden /> Cancel request</button>}
        </section>
      )}
    </main>
  );
}
