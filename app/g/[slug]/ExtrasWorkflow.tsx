'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, Sparkles } from 'lucide-react';
import { EXTRAS_GUEST_STATUS_LABEL, type ExtrasFulfillmentStatus } from '@/lib/extras/lifecycle';

export type GuestExtraOffer = {
  id: string;
  title: string;
  description: string | null;
  details: string | null;
  price_text: string | null;
  cta_label: string | null;
  category: string | null;
  max_quantity: number | null;
  kind: string;
  unit_label: string | null;
  option_label: string | null;
  options: string[] | null;
};

type OrderRow = { id: string; request_number?: string; item_title?: string; status?: string; fulfillment_status?: string; created_at?: string };
type View = 'browse' | 'detail' | 'done' | 'requests';

const CATEGORY_ORDER = ['arrival', 'comfort', 'food', 'experiences', 'transport', 'more'];
const CATEGORY_LABEL: Record<string, string> = { arrival: 'Arrival', comfort: 'Comfort', food: 'Food & Drink', experiences: 'Experiences', transport: 'Transport', more: 'More' };

export function ExtrasWorkflow(props: { slug: string; offers: GuestExtraOffer[]; onBack: () => void; onSessionExpired: () => void }) {
  const [view, setView] = useState<View>('browse');
  const [selected, setSelected] = useState<GuestExtraOffer | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [note, setNote] = useState('');
  const [preferredFor, setPreferredFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${props.slug}/extras-orders`);
      if (res.status === 401) { props.onSessionExpired(); return; }
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      setOrders(Array.isArray(json) ? json : (json.orders ?? []));
      setOrdersLoaded(true);
    } catch { setOrdersLoaded(true); }
  }, [props.slug, props.onSessionExpired]);

  useEffect(() => { if (view === 'requests') void loadOrders(); }, [view, loadOrders]);

  function openDetail(offer: GuestExtraOffer) {
    setSelected(offer); setVariant(null); setQuantity(1); setNote(''); setPreferredFor(''); setError(null); setView('detail');
  }

  async function submit() {
    if (!selected || busy) return;
    if (selected.options && selected.options.length > 0 && !variant && selected.kind !== 'package') { setError('Please choose an option before requesting this.'); return; }
    if (!guestName.trim()) { setError('Please add your name so the host knows who requested this.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/extras-request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId: selected.id, quantity: selected.kind === 'package' ? undefined : quantity, variant: variant ?? undefined, guestName: guestName.trim(), note: note.trim() || undefined, preferredFor: preferredFor ? new Date(preferredFor).toISOString() : undefined }) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) { props.onSessionExpired(); return; }
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not send your request.');
      setRequestNumber(typeof json.requestNumber === 'string' ? json.requestNumber : null); setView('done');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send your request.'); }
    finally { setBusy(false); }
  }

  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: props.offers.filter((o) => (o.category ?? 'more') === cat) })).filter((g) => g.items.length > 0);
  const maxQty = selected?.max_quantity ?? 5;

  return (
    <section aria-label="Extras and amenities" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header"><button type="button" className="gp-back" onClick={view === 'browse' ? props.onBack : () => setView('browse')}><ArrowLeft size={16} aria-hidden /> {view === 'browse' ? 'Menu' : 'Back'}</button><span className="gp-wf-title">Extras & Amenities</span></div>
      {view === 'browse' && <>
        {props.offers.length === 0 ? <div className="gp-empty"><Sparkles size={28} aria-hidden style={{ opacity: 0.5, marginBottom: 10 }} /><div>No extras or amenities are available for this stay right now.</div><div style={{ marginTop: 16 }}><button type="button" className="gp-btn gp-btn-ghost" onClick={props.onBack}>Back to menu</button></div></div> : <>
          {groups.map((g) => <div key={g.cat}><div className="gp-cat">{CATEGORY_LABEL[g.cat] ?? g.cat}</div>{g.items.map((o) => <button key={o.id} type="button" className="gp-offer" onClick={() => openDetail(o)}><div className="gp-offer-title">{o.title}</div>{o.price_text ? <div className="gp-offer-price">{o.price_text}</div> : null}{o.description ? <div className="gp-offer-desc">{o.description}</div> : null}</button>)}</div>)}
          <div style={{ marginTop: 14 }}><button type="button" className="gp-btn gp-btn-ghost" onClick={() => setView('requests')}>Your requests</button></div>
        </>}
      </>}
      {view === 'detail' && selected && <div className="gp-card">
        <div className="gp-offer-title" style={{ fontSize: '1.15rem' }}>{selected.title}</div>{selected.price_text ? <div className="gp-offer-price">{selected.price_text}</div> : null}{selected.details || selected.description ? <p className="gp-step-sub" style={{ marginTop: 10 }}>{selected.details ?? selected.description}</p> : null}
        {selected.options && selected.options.length > 0 ? <div className="gp-field"><span className="gp-label">{selected.option_label ?? 'Options'}</span><div className="gp-variant-row">{selected.options.map((opt) => <button key={opt} type="button" className={`gp-variant ${variant === opt ? 'gp-variant-on' : ''}`} onClick={() => setVariant(opt)}>{opt}</button>)}</div></div> : null}
        {selected.kind !== 'package' ? <div className="gp-field"><span className="gp-label">Quantity{selected.unit_label ? ` (${selected.unit_label})` : ''}</span><div className="gp-stepper"><button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity"><Minus size={16} aria-hidden /></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} aria-label="Increase quantity"><Plus size={16} aria-hidden /></button></div></div> : null}
        <div className="gp-field"><label className="gp-label" htmlFor="gp-extra-name">Your name</label><input id="gp-extra-name" className="gp-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} placeholder="Who should the host expect this from?" required data-testid="input-extra-guest-name" /></div>
        <div className="gp-field"><label className="gp-label" htmlFor="gp-extra-when">Preferred time (optional)</label><input id="gp-extra-when" className="gp-input" type="datetime-local" value={preferredFor} onChange={(e) => setPreferredFor(e.target.value)} /></div>
        <div className="gp-field"><label className="gp-label" htmlFor="gp-extra-note">Note for the host (optional)</label><textarea id="gp-extra-note" className="gp-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Anything we should know?" /></div>
        {error ? <div className="gp-error" role="alert">{error}</div> : null}<button type="button" className="gp-btn gp-btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : (selected.cta_label ?? 'Request')}</button>
      </div>}
      {view === 'done' && <div className="gp-card gp-confirm"><CheckCircle2 size={40} className="gp-confirm-icon" aria-hidden /><h2 className="gp-step-title" style={{ marginTop: 0 }}>Request sent</h2>{requestNumber ? <><div style={{ fontSize: '0.85rem', opacity: 0.65 }}>Reference</div><div className="gp-ref">{requestNumber}</div></> : null}<p className="gp-step-sub" style={{ marginBottom: 18 }}>Your host has been notified and will confirm shortly.</p><button type="button" className="gp-btn gp-btn-primary" onClick={() => setView('browse')}>Browse more</button><div style={{ height: 10 }} /><button type="button" className="gp-btn gp-btn-ghost" onClick={props.onBack}>Back to menu</button></div>}
      {view === 'requests' && <>{!ordersLoaded ? <div className="gp-empty"><Loader2 size={18} className="gp-spin" aria-label="Loading requests" /></div> : orders.length === 0 ? <div className="gp-empty">You haven&apos;t requested anything yet.</div> : orders.map((o) => <div key={o.id} className="gp-card" style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><div className="gp-offer-title">{o.item_title ?? 'Request'}</div><span className="gp-badge">{EXTRAS_GUEST_STATUS_LABEL[(o.fulfillment_status ?? o.status ?? 'requested') as ExtrasFulfillmentStatus] ?? 'Requested'}</span></div>{o.request_number ? <div className="gp-offer-desc">Ref {o.request_number}</div> : null}</div>)}</>}
    </section>
  );
}
