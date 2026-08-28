'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ConciergeBell, Loader2, Search, Sparkles, TriangleAlert, X } from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { linkify } from '@/lib/guest/linkify';
import type { PortalT } from '@/lib/guest/portal-strings';
import { CardArt } from './CardArt';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'host';
  content: string;
  createdAt?: string;
  isEmergency?: boolean;
  escalated?: boolean;
};

type AssistantCard = {
  key: string;
  title: string;
  description: string;
  prompt: string;
  prompts?: string[];
};

type Appliance = {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  locationNote: string | null;
};

// Fallback cards (host preview, or before the Brain-backed cards arrive) are
// templated through the portal dictionary so the grid switches language with
// everything else. Server-provided cards keep the host's own wording.
function fallbackCards(t: PortalT): AssistantCard[] {
  return [
    {
      key: 'wifi', title: t('fbWifiTitle'), description: t('fbWifiDesc'), prompt: t('fbWifiP'),
      prompts: [t('fbWifiQ1'), t('fbWifiQ2'), t('fbWifiQ3'), t('fbWifiQ4')],
    },
    {
      key: 'checkin', title: t('fbCheckinTitle'), description: t('fbCheckinDesc'), prompt: t('fbCheckinP'),
      prompts: [t('fbCheckinQ1'), t('fbCheckinQ2'), t('fbCheckinQ3')],
    },
    {
      key: 'checkout', title: t('fbCheckoutTitle'), description: t('fbCheckoutDesc'), prompt: t('fbCheckoutP'),
      prompts: [t('fbCheckoutQ1'), t('fbCheckoutQ2'), t('fbCheckoutQ3')],
    },
    { key: 'local', title: t('fbLocalTitle'), description: t('fbLocalDesc'), prompt: t('fbLocalP'), prompts: [] },
  ];
}

// The per-appliance question sheet. Templated from the appliance's display name
// so any inventory the host saves to the Brain instantly gets a useful sheet.
function appliancePrompts(t: PortalT, a: Appliance): string[] {
  return [
    t('apUse', { name: a.name }),
    t('apWhere', { name: a.name }),
    t('apOn', { name: a.name }),
    t('apClean', { name: a.name }),
    t('apBroken', { name: a.name }),
  ];
}

function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((segment, index) =>
        segment.kind === 'link' ? (
          <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {segment.label}
          </a>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </>
  );
}

function mapHistory(row: any): ChatMsg {
  return {
    id: row.id ?? crypto.randomUUID(),
    role: row.role === 'guest' ? 'user' : row.role === 'host' ? 'host' : 'assistant',
    content: row.content ?? '',
    createdAt: row.created_at,
    isEmergency: row.intent === 'emergency',
  };
}

// Bottom-sheet (phone) / centered dialog (desktop) shell shared by the card
// question sheet and the appliance picker. Closes on backdrop tap and Escape.
function PortalModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="gp-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="gp-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="gp-modal-head">
          <span className="gp-modal-title">{title}</span>
          <button type="button" className="gp-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="gp-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function AiChatWorkflow(props: {
  slug: string;
  propertyId: string;
  hostPreview: boolean;
  // The guest's portal language (Globe picker). Sent with every message — the
  // concierge replies in it, and any escalation is translated for the host.
  language?: string | null;
  t: PortalT;
  onBack: () => void;
  onOpenHostChat: () => void;
  onSessionExpired: () => void;
}) {
  const router = useRouter();
  const { t } = props;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [cards, setCards] = useState<AssistantCard[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalationNotice, setEscalationNotice] = useState(false);
  // Card tap state: a question sheet for the tapped card, or the two-step
  // appliance picker (searchable list → per-appliance question sheet).
  const [activeCard, setActiveCard] = useState<AssistantCard | null>(null);
  const [appliancePickerOpen, setAppliancePickerOpen] = useState(false);
  const [appliances, setAppliances] = useState<Appliance[] | null>(null);
  const [appliancesLoading, setAppliancesLoading] = useState(false);
  const [applianceQuery, setApplianceQuery] = useState('');
  const [activeAppliance, setActiveAppliance] = useState<Appliance | null>(null);
  const [hostPinged, setHostPinged] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Host preview cards come from the dictionary so they follow the selected
  // language like every other surface.
  useEffect(() => {
    if (props.hostPreview) setCards(fallbackCards(t));
  }, [props.hostPreview, t]);

  const loadHistory = useCallback(async () => {
    if (props.hostPreview) return;
    const res = await fetch(`/api/guest/${props.slug}/messages`, { cache: 'no-store' });
    if (res.status === 401) {
      props.onSessionExpired();
      return;
    }
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

  useEffect(() => {
    if (props.hostPreview) return;
    fetch(`/api/guest/${props.slug}/assistant-cards`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (Array.isArray(json?.cards)) setCards(json.cards);
      })
      .catch(() => undefined);
  }, [props.hostPreview, props.slug]);

  // New turns (and the typing indicator) glide to the bottom instead of the
  // chat jumping.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, busy]);

  const loadAppliances = useCallback(async () => {
    setAppliancesLoading(true);
    setPickerError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/appliances`, { cache: 'no-store' });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPickerError(json.error || t('askError'));
        setAppliances([]);
        return;
      }
      setAppliances(Array.isArray(json.appliances) ? json.appliances : []);
    } finally {
      setAppliancesLoading(false);
    }
  }, [props.slug, props.onSessionExpired, t]);

  async function syncEscalation(question: string, answer: string) {
    if (props.hostPreview) return;
    await fetch(`/api/guest/${props.slug}/host-chat/sync-escalation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, answer }),
    }).catch(() => undefined);
  }

  function growComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function sendMessage(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setEscalationNotice(false);
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    setMessages((current) => [...current, userMsg]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const url = props.hostPreview
        ? `/api/host/properties/${props.propertyId}/preview-chat`
        : `/api/guest/${props.slug}/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          props.hostPreview
            ? {
                message: trimmed,
                language: props.language ?? undefined,
                // The sandbox holds no thread server-side; resend the recent tail so
                // multi-turn preview conversations keep their context.
                history: messages.slice(-6).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content })),
              }
            : { message: trimmed, language: props.language ?? undefined },
        ),
      });
      if (res.status === 401 && !props.hostPreview) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || t('askError'));
        return;
      }

      const answer = String(json.answer ?? t('askError'));
      const escalated = json.escalated === true;
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: answer,
        isEmergency: json.isEmergency === true,
        escalated,
      }]);
      if (escalated) {
        setEscalationNotice(true);
        void syncEscalation(trimmed, answer);
      }
    } finally {
      setBusy(false);
    }
  }

  // Card taps never auto-send. Each card opens the flow that matches intent:
  //   local      → the full Local Guide page (filters, directions, links)
  //   appliances → the Brain-backed picker, then a per-appliance question sheet
  //   everything → a sheet of the questions guests actually ask about it
  function openCard(card: AssistantCard) {
    if (busy) return;
    if (card.key === 'local') {
      router.push(`/g/${props.slug}/local`);
      return;
    }
    if (card.key === 'appliances' && !props.hostPreview) {
      setActiveAppliance(null);
      setApplianceQuery('');
      setHostPinged(false);
      setPickerError(null);
      setAppliancePickerOpen(true);
      if (appliances === null && !appliancesLoading) void loadAppliances();
      return;
    }
    setActiveCard(card);
  }

  function askFromSheet(question: string) {
    setActiveCard(null);
    setActiveAppliance(null);
    setAppliancePickerOpen(false);
    void sendMessage(question);
  }

  // The Brain has no appliances saved: the guest's tap becomes a host ping
  // (guest-initiated escalation — rate-limited, translated, and notified
  // through the existing host fan-out) instead of a dead end.
  async function pingHostForAppliances() {
    if (hostPinged || busy) return;
    setBusy(true);
    setPickerError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/escalate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message:
            'I was looking for appliance instructions (coffee maker, toaster, washer, etc.), but no appliances are listed for this property yet. Could you add them in the Brain, or tell me how they work?',
          language: props.language ?? undefined,
        }),
      });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPickerError(json.error || t('askError'));
        return;
      }
      setHostPinged(true);
    } finally {
      setBusy(false);
    }
  }

  const filteredAppliances = (appliances ?? []).filter((a) => {
    const q = applianceQuery.trim().toLowerCase();
    if (!q) return true;
    return [a.name, a.brand, a.category, a.locationNote].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return (
    <section aria-label={t('askTitle')}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> {t('menu')}
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 className="gp-wf-title gp-title-row">
          <Sparkles size={20} aria-hidden /> {t('askTitle')}
        </h2>
        <p className="gp-muted" style={{ margin: '.35rem 0 0' }}>
          {t('askSub')}
        </p>
      </div>

      <AiDisclosure />

      {cards.length > 0 && (
        <div className="gp-assist-grid">
          {cards.map((card, index) => (
            <button
              key={card.key}
              type="button"
              className="gp-assist-card"
              style={{ animationDelay: `${index * 60}ms` }}
              onClick={() => openCard(card)}
              disabled={busy}
            >
              <CardArt cardKey={card.key} size={26} />
              <span className="gp-assist-title">{card.title}</span>
              <span className="gp-assist-desc">{card.description}</span>
            </button>
          ))}
        </div>
      )}

      {escalationNotice && (
        <div role="status" className="gp-notice">
          <TriangleAlert size={17} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            {t('askEscNotice')}
            <button type="button" onClick={props.onOpenHostChat} className="gp-msg-link" style={{ marginLeft: '.5rem' }}>
              {t('askOpenHostChat')}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="gp-chat-panel">
        {messages.length === 0 && !busy ? (
          <p className="gp-muted">{t('askEmpty')}</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`gp-msg-row ${message.role === 'user' ? 'gp-msg-row-user' : ''}`}>
              <div className={`gp-msg ${message.role === 'user' ? 'gp-msg-user' : message.role === 'host' ? 'gp-msg-host' : ''}`}>
                {message.role === 'host' && <div className="gp-msg-tag">{t('hostReplyTag')}</div>}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
                {message.isEmergency && <p className="gp-msg-emergency">{t('askEmergency')}</p>}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="gp-msg-row">
            <div className="gp-msg gp-typing" role="status" aria-label={t('askTyping')}>
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="gp-alert-text">{error}</p>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
        className="gp-composer"
      >
        <label htmlFor="ai-chat-input" className="sr-only">{t('askTitle')}</label>
        <textarea
          id="ai-chat-input"
          ref={inputRef}
          value={input}
          rows={1}
          onChange={(event) => {
            setInput(event.target.value);
            growComposer();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(input);
            }
          }}
          placeholder={t('askPlaceholder')}
        />
        <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label={t('sendMessage')} title={t('sendMessage')}>
          {busy ? <Loader2 size={18} className="gp-spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
        </button>
      </form>

      {activeCard && (
        <PortalModal title={activeCard.title} onClose={() => setActiveCard(null)}>
          <p className="gp-modal-sub">{t('askSheetSub')}</p>
          <div className="gp-prompt-list">
            {(activeCard.prompts && activeCard.prompts.length > 0 ? activeCard.prompts : [activeCard.prompt]).map((question) => (
              <button key={question} type="button" className="gp-prompt-item" onClick={() => askFromSheet(question)}>
                {question}
              </button>
            ))}
          </div>
        </PortalModal>
      )}

      {appliancePickerOpen && (
        <PortalModal
          title={activeAppliance ? activeAppliance.name : t('askAppliances')}
          onClose={() => { setAppliancePickerOpen(false); setActiveAppliance(null); }}
        >
          {activeAppliance ? (
            <>
              <p className="gp-modal-sub">
                {[activeAppliance.brand, activeAppliance.locationNote].filter(Boolean).join(' · ') || t('askSheetSub')}
              </p>
              <div className="gp-prompt-list">
                {appliancePrompts(t, activeAppliance).map((question) => (
                  <button key={question} type="button" className="gp-prompt-item" onClick={() => askFromSheet(question)}>
                    {question}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="gp-msg-link" onClick={() => setActiveAppliance(null)}>
                  {t('askBackToAppliances')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="gp-picker-search" style={{ position: 'relative' }}>
                <Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }} />
                <input
                  className="gp-input"
                  style={{ paddingLeft: 34 }}
                  value={applianceQuery}
                  onChange={(event) => setApplianceQuery(event.target.value)}
                  placeholder={t('askApplianceSearch')}
                  aria-label={t('askApplianceSearch')}
                />
              </div>

              {appliancesLoading ? (
                <p className="gp-muted"><Loader2 size={15} className="gp-spin" aria-hidden /> {t('askApplianceLoad')}</p>
              ) : appliances !== null && appliances.length === 0 ? (
                <div>
                  <p className="gp-modal-sub">{t('askApplianceEmpty')}</p>
                  {hostPinged ? (
                    <p className="gp-modal-sub" role="status">{t('askAppliancePinged')}</p>
                  ) : (
                    <button type="button" className="gp-btn gp-btn-accent" onClick={() => void pingHostForAppliances()} disabled={busy}>
                      <ConciergeBell size={16} aria-hidden /> {t('askAppliancePing')}
                    </button>
                  )}
                </div>
              ) : filteredAppliances.length === 0 ? (
                <p className="gp-muted">{t('askApplianceNone', { query: applianceQuery })}</p>
              ) : (
                <div className="gp-picker-list">
                  {filteredAppliances.map((a) => (
                    <button key={a.id} type="button" className="gp-picker-item" onClick={() => setActiveAppliance(a)}>
                      <span>
                        <span className="gp-picker-item-title">{a.name}</span>
                        <span className="gp-picker-item-sub">
                          {[a.brand, a.category, a.locationNote].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {pickerError && <p role="alert" className="gp-alert-text" style={{ marginTop: 10 }}>{pickerError}</p>}
            </>
          )}
        </PortalModal>
      )}
    </section>
  );
}
