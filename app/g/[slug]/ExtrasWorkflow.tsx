'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, Sparkles } from 'lucide-react';
import { EXTRAS_GUEST_STATUS_LABEL, type ExtrasFulfillmentStatus } from '@/lib/extras/lifecycle';
import type { PortalT } from '@/lib/guest/portal-strings';

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
const CATEGORY_KEY: Record<string, string> = {
  arrival: 'xcatArrival',
  comfort: 'xcatComfort',
  food: 'xcatFood',
  experiences: 'xcatExperiences',
  transport: 'xcatTransport',
  more: 'xcatMore',
};

// Workflow 4 — Extras & Amenities. The request form prefills the guest's
// registered name (their own portal, their own identity) so a request is one
// tap less. All chrome renders through the portal dictionary; host-authored
// offer titles/descriptions/CTA labels stay in the host's own words.
//
// Host preview: the offer catalog is the property's real one, but requesting
// goes to the sandbox endpoint — no extras_orders row, no host notification.
// The requests view lists only what this preview session requested, in memory.
export function ExtrasWorkflow(props: {
  slug: string;
  propertyId?: string;
  hostPreview?: boolean;
  offers: GuestExtraOffer[];
  guestName: string | null;
  t: PortalT;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = props;
  const hostPreview = props.hostPreview === true;
  const [view, setView] = useState<View>('browse');
  const [selected, setSelected] = useState<GuestExtraOffer | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [guestName, setGuestName] = useState(props.guestName ?? '');
  const [note, setNote] = useState('');
  const [preferredFor, setPreferredFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const loadOrders = useCallback(async () => {
    // Preview has no server-side orders; the requests view is local-only.
    if (hostPreview) {
      setOrdersLoaded(true);
      return;
    }
    try {
      const res = await fetch(`/api/guest/${props.slug}/extras-orders`);
      if (res.status === 401) { props.onSessionExpired(); return; }
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      setOrders(Array.isArray(json) ? json : (json.orders ?? []));
      setOrdersLoaded(true);
    } catch { setOrdersLoaded(true); }
  }, [hostPreview, props.slug, props.onSessionExpired]);

  useEffect(() => { if (view === 'requests') void loadOrders(); }, [view, loadOrders]);

  function openDetail(offer: GuestExtraOffer) {
    setSelected(offer); setVariant(null); setQuantity(1); setNote(''); setPreferredFor(''); setError(null); setView('detail');
  }

  async function submit() {
    if (!selected || busy) return;
    if (selected.options && selected.options.length > 0 && !variant && selected.kind !== 'package') { setError(t('xErrOption')); return; }
    if (!guestName.trim()) { setError(t('xErrName')); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(
        hostPreview ? `/api/host/properties/${props.propertyId}/preview-extras-request` : `/api/guest/${props.slug}/extras-request`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId: selected.id, quantity: selected.kind === 'package' ? undefined : quantity, variant: variant ?? undefined, guestName: guestName.trim(), note: note.trim() || undefined, preferredFor: preferredFor ? new Date(preferredFor).toISOString() : undefined }) },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && !hostPreview) { props.onSessionExpired(); return; }
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : t('xErrOption'));
      const ref = typeof json.requestNumber === 'string' ? json.requestNumber : null;
      setRequestNumber(ref);
      if (hostPreview) {
        setOrders((current) => [
          ...current,
          { id: `preview-${crypto.randomUUID()}`, item_title: selected.title, fulfillment_status: 'requested', request_number: ref ?? undefined, created_at: new Date().toISOString() },
        ]);
      }
      setView('done');
    } catch (err) { setError(err instanceof Error ? err.message : t('xErrOption')); }
    finally { setBusy(false); }
  }

  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: props.offers.filter((o) => (o.category ?? 'more') === cat) })).filter((g) => g.items.length > 0);
  const maxQty = selected?.max_quantity ?? 5;
  const categoryLabel = (cat: string) => (CATEGORY_KEY[cat] ? t(CATEGORY_KEY[cat]) : cat);

  return (
    <section aria-label={t('xTitle')} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={view === 'browse' ? props.onBack : () => setView('browse')}>
          <ArrowLeft size={16} aria-hidden /> {view === 'browse' ? t('menu') : t('back')}
        </button>
        <span className="gp-wf-title">{t('xTitle')}</span>
      </div>

      {view === 'browse' && <>
        {props.offers.length === 0 ? (
          <div className="gp-empty">
            <Sparkles size={28} aria-hidden style={{ opacity: 0.5, marginBottom: 10 }} />
            <div>{t('xEmpty')}</div>
            <div style={{ marginTop: 16 }}><button type="button" className="gp-btn gp-btn-ghost" onClick={props.onBack}>{t('backToMenu')}</button></div>
          </div>
        ) : <>
          {groups.map((g) => (
            <div key={g.cat}>
              <div className="gp-cat">{categoryLabel(g.cat)}</div>
              {g.items.map((o) => (
                <button key={o.id} type="button" className="gp-offer" onClick={() => openDetail(o)}>
                  <div className="gp-offer-title">{o.title}</div>
                  {o.price_text ? <div className="gp-offer-price">{o.price_text}</div> : null}
                  {o.description ? <div className="gp-offer-desc">{o.description}</div> : null}
                </button>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 14 }}><button type="button" className="gp-btn gp-btn-ghost" onClick={() => setView('requests')}>{t('xYourRequests')}</button></div>
        </>}
      </>}

      {view === 'detail' && selected && <div className="gp-card">
        <div className="gp-offer-title" style={{ fontSize: '1.15rem' }}>{selected.title}</div>
        {selected.price_text ? <div className="gp-offer-price">{selected.price_text}</div> : null}
        {selected.details || selected.description ? <p className="gp-step-sub" style={{ marginTop: 10 }}>{selected.details ?? selected.description}</p> : null}
        {selected.options && selected.options.length > 0 ? (
          <div className="gp-field">
            <span className="gp-label">{selected.option_label ?? t('xOptions')}</span>
            <div className="gp-variant-row">
              {selected.options.map((opt) => <button key={opt} type="button" className={`gp-variant ${variant === opt ? 'gp-variant-on' : ''}`} onClick={() => setVariant(opt)}>{opt}</button>)}
            </div>
          </div>
        ) : null}
        {selected.kind !== 'package' ? (
          <div className="gp-field">
            <span className="gp-label">{t('xQuantity')}{selected.unit_label ? ` (${selected.unit_label})` : ''}</span>
            <div className="gp-stepper">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="-"><Minus size={16} aria-hidden /></button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} aria-label="+"><Plus size={16} aria-hidden /></button>
            </div>
          </div>
        ) : null}
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-extra-name">{t('xYourName')}</label>
          <input id="gp-extra-name" className="gp-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} placeholder={t('xNamePlaceholder')} required data-testid="input-extra-guest-name" />
        </div>
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-extra-when">{t('xWhen')}</label>
          <input id="gp-extra-when" className="gp-input" type="datetime-local" value={preferredFor} onChange={(e) => setPreferredFor(e.target.value)} />
        </div>
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-extra-note">{t('xNote')}</label>
          <textarea id="gp-extra-note" className="gp-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('xNotePlaceholder')} />
        </div>
        {error ? <div className="gp-error" role="alert">{error}</div> : null}
        <button type="button" className="gp-btn gp-btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? t('xSending') : (selected.cta_label ?? t('xRequest'))}
        </button>
      </div>}

      {view === 'done' && (
        <div className="gp-card gp-confirm">
          <CheckCircle2 size={40} className="gp-confirm-icon" aria-hidden />
          <h2 className="gp-step-title" style={{ marginTop: 0 }}>{t('xSent')}</h2>
          {requestNumber ? <><div style={{ fontSize: '0.85rem', opacity: 0.65 }}>{t('xRef')}</div><div className="gp-ref">{requestNumber}</div></> : null}
          <p className="gp-step-sub" style={{ marginBottom: 18 }}>{t('xSentSub')}</p>
          <button type="button" className="gp-btn gp-btn-primary" onClick={() => setView('browse')}>{t('xBrowseMore')}</button>
          <div style={{ height: 10 }} />
          <button type="button" className="gp-btn gp-btn-ghost" onClick={props.onBack}>{t('backToMenu')}</button>
        </div>
      )}

      {view === 'requests' && <>
        {!ordersLoaded ? (
          <div className="gp-empty"><Loader2 size={18} className="gp-spin" aria-label={t('loading')} /></div>
        ) : orders.length === 0 ? (
          <div className="gp-empty">{t('xNoRequests')}</div>
        ) : orders.map((o) => (
          <div key={o.id} className="gp-card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div className="gp-offer-title">{o.item_title ?? t('xRequest')}</div>
              <span className="gp-badge">{EXTRAS_GUEST_STATUS_LABEL[(o.fulfillment_status ?? o.status ?? 'requested') as ExtrasFulfillmentStatus] ?? t('xRequest')}</span>
            </div>
            {o.request_number ? <div className="gp-offer-desc">{t('xRefPrefix')} {o.request_number}</div> : null}
          </div>
        ))}
      </>}
    </section>
  );
}
