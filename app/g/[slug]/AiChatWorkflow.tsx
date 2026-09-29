'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ConciergeBell, Loader2, Search, Sparkles, TriangleAlert, X } from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { linkify } from '@/lib/guest/linkify';
import type { PortalT } from '@/lib/guest/portal-strings';
import type { CardCopy } from '@/lib/guest/card-copy';
import { messageNotificationNotice } from '@/lib/notifications/message-notice';
import { CardArt } from './CardArt';
import { useLocalizedAssistantCards } from './useLocalizedAssistantCards';
import { LocalizedApplianceQuestions } from './LocalizedApplianceQuestions';

type ChatMsg = { id: string; role: 'user' | 'assistant' | 'host'; content: string; createdAt?: string; isEmergency?: boolean; escalated?: boolean };
type Appliance = { id: string; category: string; name: string; brand: string | null; locationNote: string | null; questions?: { id: string; text: string }[] };

function fallbackCards(t: PortalT): CardCopy[] {
  return [
    { key: 'wifi', title: t('fbWifiTitle'), description: t('fbWifiDesc'), prompt: t('fbWifiP'), prompts: [t('fbWifiQ1'), t('fbWifiQ2'), t('fbWifiQ3'), t('fbWifiQ4')] },
    { key: 'checkin', title: t('fbCheckinTitle'), description: t('fbCheckinDesc'), prompt: t('fbCheckinP'), prompts: [t('fbCheckinQ1'), t('fbCheckinQ2'), t('fbCheckinQ3')] },
    { key: 'checkout', title: t('fbCheckoutTitle'), description: t('fbCheckoutDesc'), prompt: t('fbCheckoutP'), prompts: [t('fbCheckoutQ1'), t('fbCheckoutQ2'), t('fbCheckoutQ3')] },
    { key: 'local', title: t('fbLocalTitle'), description: t('fbLocalDesc'), prompt: t('fbLocalP'), prompts: [] },
  ];
}
function LinkedText({ text }: { text: string }) {
  return <>{linkify(text).map((segment, index) => segment.kind === 'link'
    ? <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{segment.label}</a>
    : <span key={index}>{segment.value}</span>)}</>;
}
function mapHistory(row: any): ChatMsg {
  return { id: row.id ?? crypto.randomUUID(), role: row.role === 'guest' ? 'user' : row.role === 'host' ? 'host' : 'assistant', content: row.content ?? '', createdAt: row.created_at, isEmergency: row.intent === 'emergency' };
}
function PortalModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="gp-modal-backdrop" role="presentation" onClick={onClose}>
    <div className="gp-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="gp-modal-head"><span className="gp-modal-title">{title}</span><button type="button" className="gp-icon-btn" onClick={onClose} aria-label="Close"><X size={16} aria-hidden /></button></div>
      <div className="gp-modal-body">{children}</div>
    </div>
  </div>;
}

export function AiChatWorkflow(props: { slug: string; propertyId: string; hostPreview: boolean; language?: string | null; t: PortalT; onBack: () => void; onOpenHostChat: () => void; onSessionExpired: () => void }) {
  const router = useRouter();
  const { t } = props;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const localized = useLocalizedAssistantCards(props.slug, props.language, !props.hostPreview);
  const cards = props.hostPreview ? fallbackCards(t) : localized.cards;
  const cardCopyUnavailable = !props.hostPreview && (localized.loading || localized.error);
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null);
  const activeCard = cards.find((card) => card.key === activeCardKey) ?? null;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalationNotice, setEscalationNotice] = useState<string | null>(null);
  const [appliancePickerOpen, setAppliancePickerOpen] = useState(false);
  const [appliances, setAppliances] = useState<Appliance[] | null>(null);
  const [appliancesLoading, setAppliancesLoading] = useState(false);
  const [applianceQuery, setApplianceQuery] = useState('');
  const [activeAppliance, setActiveAppliance] = useState<Appliance | null>(null);
  const [selectedAppliance, setSelectedAppliance] = useState<Appliance | null>(null);
  const [hostPinged, setHostPinged] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadHistory = useCallback(async () => {
    if (props.hostPreview) return;
    const res = await fetch(`/api/guest/${props.slug}/messages`, { cache: 'no-store' });
    if (res.status === 401) { props.onSessionExpired(); return; }
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json.messages)) setMessages(json.messages.map(mapHistory));
  }, [props.hostPreview, props.slug, props.onSessionExpired]);
  useEffect(() => {
    void loadHistory();
    if (props.hostPreview) return;
    const timer = window.setInterval(() => void loadHistory(), 8000);
    return () => window.clearInterval(timer);
  }, [loadHistory, props.hostPreview]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, busy]);

  const loadAppliances = useCallback(async () => {
    setAppliancesLoading(true); setPickerError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/appliances`, { cache: 'no-store' });
      if (res.status === 401) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setPickerError(json.error || t('askError')); setAppliances(null); return; }
      setAppliances(Array.isArray(json.appliances) ? json.appliances : []);
    } catch { setPickerError(t('askError')); setAppliances(null); }
    finally { setAppliancesLoading(false); }
  }, [props.slug, props.onSessionExpired, t]);

  async function syncEscalation(question: string, answer: string) {
    if (props.hostPreview) return;
    try {
      const res = await fetch(`/api/guest/${props.slug}/host-chat/sync-escalation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, answer }) });
      const json = await res.json().catch(() => ({}));
      setEscalationNotice(res.ok && json.messageStored ? messageNotificationNotice(json.notification?.sms) : t('askError'));
    } catch { setEscalationNotice(t('askError')); }
  }
  function growComposer() {
    const el = inputRef.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }
  async function sendMessage(raw: string) {
    const trimmed = raw.trim(); if (!trimmed || busy) return;
    setBusy(true); setError(null); setEscalationNotice(null);
    const selectedForTurn = selectedAppliance;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: trimmed }]); setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const url = props.hostPreview ? `/api/host/properties/${props.propertyId}/preview-chat` : `/api/guest/${props.slug}/chat`;
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(props.hostPreview
        ? { message: trimmed, language: props.language ?? undefined, history: messages.slice(-6).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content })) }
        : { message: trimmed, language: props.language ?? undefined, applianceId: selectedForTurn?.id }) });
      if (res.status === 401 && !props.hostPreview) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || t('askError')); return; }
      if (json.unavailable === true) { setError(t('askError')); return; }
      const answer = String(json.answer ?? t('askError'));
      const escalated = json.escalated === true;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: answer, isEmergency: json.isEmergency === true, escalated }]);
      if (escalated) void syncEscalation(selectedForTurn ? `${selectedForTurn.name}: ${trimmed}` : trimmed, answer);
    } catch { setError(t('askError')); }
    finally { setBusy(false); }
  }
  function openCard(card: CardCopy) {
    if (busy || cardCopyUnavailable) return;
    if (card.key === 'local') { setSelectedAppliance(null); router.push(`/g/${props.slug}/local`); return; }
    if (card.key === 'appliances' && !props.hostPreview) {
      setSelectedAppliance(null); setActiveAppliance(null); setApplianceQuery(''); setHostPinged(null); setPickerError(null);
      setAppliancePickerOpen(true); if (appliances === null && !appliancesLoading) void loadAppliances(); return;
    }
    setSelectedAppliance(null); setActiveCardKey(card.key);
  }
  function askFromSheet(question: string) {
    if (cardCopyUnavailable) return;
    setActiveCardKey(null); setActiveAppliance(null); setAppliancePickerOpen(false); void sendMessage(question);
  }
  async function pingHostForAppliances() {
    if (hostPinged || busy) return; setBusy(true); setPickerError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/escalate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'I was looking for appliance instructions, but no appliances are listed for this property yet. Could you tell me how they work?', language: props.language ?? undefined }) });
      if (res.status === 401) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setPickerError(json.error || t('askError')); return; }
      if (json.messageStored) setHostPinged(messageNotificationNotice(json.notification?.sms));
      else setPickerError(t('askError'));
    } catch { setPickerError(t('askError')); }
    finally { setBusy(false); }
  }
  const filteredAppliances = (appliances ?? []).filter((a) => {
    const q = applianceQuery.trim().toLowerCase();
    return !q || [a.name, a.brand, a.category, a.locationNote].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return <section aria-label={t('askTitle')}>
    <div className="gp-wf-header"><button type="button" className="gp-back" onClick={props.onBack}><ArrowLeft size={16} aria-hidden /> {t('menu')}</button></div>
    <div style={{ marginBottom: '1rem' }}><h2 className="gp-wf-title gp-title-row"><Sparkles size={20} aria-hidden /> {t('askTitle')}</h2><p className="gp-muted" style={{ margin: '.35rem 0 0' }}>{t('askSub')}</p></div>
    <AiDisclosure />
    {!props.hostPreview && localized.loading && <p className="gp-muted" role="status">{t('loading')}</p>}
    {!props.hostPreview && localized.error && <button type="button" className="gp-msg-link" onClick={localized.retry}>{t('askError')}</button>}
    {cards.length > 0 && <div className="gp-assist-grid">{cards.map((card, index) => <button key={card.key} type="button" className="gp-assist-card" style={{ animationDelay: `${index * 60}ms` }} onClick={() => openCard(card)} disabled={busy || cardCopyUnavailable}>
      <CardArt cardKey={card.key} size={26} /><span className="gp-assist-title">{card.title}</span><span className="gp-assist-desc">{card.description}</span>
    </button>)}</div>}
    {escalationNotice && <div role="status" className="gp-notice"><TriangleAlert size={17} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /><div>{escalationNotice}<button type="button" onClick={props.onOpenHostChat} className="gp-msg-link" style={{ marginLeft: '.5rem' }}>{t('askOpenHostChat')}</button></div></div>}
    <div aria-live="polite" className="gp-chat-panel">
      {messages.length === 0 && !busy ? <p className="gp-muted">{t('askEmpty')}</p> : messages.map((message) => <div key={message.id} className={`gp-msg-row ${message.role === 'user' ? 'gp-msg-row-user' : ''}`}>
        <div className={`gp-msg ${message.role === 'user' ? 'gp-msg-user' : message.role === 'host' ? 'gp-msg-host' : ''}`}>
          {message.role === 'host' && <div className="gp-msg-tag">{t('hostReplyTag')}</div>}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
          {message.isEmergency && <p className="gp-msg-emergency">{t('askEmergency')}</p>}
        </div>
      </div>)}
      {busy && <div className="gp-msg-row"><div className="gp-msg gp-typing" role="status" aria-label={t('askTyping')}><span /><span /><span /></div></div>}
      <div ref={endRef} />
    </div>
    {error && <p role="alert" className="gp-alert-text">{error}</p>}
    {selectedAppliance && <div className="gp-notice" role="status" style={{ marginBottom: '.5rem' }}><span>{selectedAppliance.name}</span><button type="button" className="gp-icon-btn" onClick={() => setSelectedAppliance(null)} aria-label="Clear selected appliance"><X size={15} aria-hidden /></button></div>}
    <form onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }} className="gp-composer">
      <label htmlFor="ai-chat-input" className="sr-only">{t('askTitle')}</label>
      <textarea id="ai-chat-input" ref={inputRef} value={input} rows={1} onChange={(event) => { setInput(event.target.value); growComposer(); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(input); } }} placeholder={`${t('askTitle')}…`} />
      <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label={t('sendMessage')} title={t('sendMessage')}>
        {busy ? <Loader2 size={18} className="gp-spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
      </button>
    </form>
    {activeCard && <PortalModal title={activeCard.title} onClose={() => setActiveCardKey(null)}>
      <p className="gp-modal-sub">{t('askSheetSub')}</p>
      <div className="gp-prompt-list">{(activeCard.prompts.length ? activeCard.prompts : [activeCard.prompt]).map((question) => <button key={question} type="button" className="gp-prompt-item" disabled={cardCopyUnavailable} onClick={() => askFromSheet(question)}>{question}</button>)}</div>
    </PortalModal>}
    {appliancePickerOpen && <PortalModal title={activeAppliance ? activeAppliance.name : t('askAppliances')} onClose={() => { setAppliancePickerOpen(false); setActiveAppliance(null); }}>
      {activeAppliance ? <>
        <p className="gp-modal-sub">{[activeAppliance.brand, activeAppliance.locationNote].filter(Boolean).join(' · ') || t('askSheetSub')}</p>
        <div className="gp-prompt-list">{(activeAppliance.questions ?? []).map((item) => <button key={item.id} type="button" className="gp-prompt-item" disabled={cardCopyUnavailable} onClick={() => askFromSheet(item.text)}>{item.text}</button>)}</div>
        {(activeAppliance.questions ?? []).length === 0 && <p className="gp-muted">{t('askTitle')}</p>}
        <div style={{ marginTop: 10, display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="gp-msg-link" onClick={() => { setAppliancePickerOpen(false); setActiveAppliance(null); inputRef.current?.focus(); }}>{t('askTitle')}</button>
          <button type="button" className="gp-msg-link" onClick={() => setActiveAppliance(null)}>{t('askBackToAppliances')}</button>
        </div>
      </> : <>
        <div className="gp-picker-search" style={{ position: 'relative' }}><Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }} />
          <input className="gp-input" style={{ paddingLeft: 34 }} value={applianceQuery} onChange={(event) => setApplianceQuery(event.target.value)} placeholder={t('askApplianceSearch')} aria-label={t('askApplianceSearch')} />
        </div>
        {appliancesLoading ? <p className="gp-muted"><Loader2 size={15} className="gp-spin" aria-hidden /> {t('askApplianceLoad')}</p>
          : pickerError && appliances === null ? <button type="button" className="gp-msg-link" onClick={() => void loadAppliances()}>{t('askApplianceLoad')}</button>
          : appliances !== null && appliances.length === 0 ? <div><p className="gp-modal-sub">{t('askApplianceEmpty')}</p>{hostPinged ? <p className="gp-modal-sub" role="status">{hostPinged}</p>
            : <button type="button" className="gp-btn gp-btn-accent" onClick={() => void pingHostForAppliances()} disabled={busy}><ConciergeBell size={16} aria-hidden /> {t('askAppliancePing')}</button>}</div>
          : filteredAppliances.length === 0 ? <p className="gp-muted">{t('askApplianceNone', { query: applianceQuery })}</p>
          : <div className="gp-picker-list">{filteredAppliances.map((a) => <button key={a.id} type="button" className="gp-picker-item" onClick={() => { setActiveAppliance(a); setSelectedAppliance(a); }}>
            <span><span className="gp-picker-item-title">{a.name}</span><span className="gp-picker-item-sub">{[a.brand, a.category, a.locationNote].filter(Boolean).join(' · ')}</span></span>
          </button>)}</div>}
        {pickerError && <p role="alert" className="gp-alert-text" style={{ marginTop: 10 }}>{pickerError}</p>}
      </>}
    </PortalModal>}
  </section>;
}
