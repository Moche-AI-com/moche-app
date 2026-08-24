'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ConciergeBell, Loader2, Search, Sparkles, TriangleAlert, X } from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { linkify } from '@/lib/guest/linkify';
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

const FALLBACK_CARDS: AssistantCard[] = [
  {
    key: 'wifi', title: 'Wi-Fi', description: 'Network and connection help.', prompt: 'What is the Wi-Fi network and password?',
    prompts: ['What is the Wi-Fi network name?', 'What is the Wi-Fi password?', 'Where is the Wi-Fi router located?', 'The Wi-Fi is not working — what should I try?'],
  },
  {
    key: 'checkin', title: 'Check-in', description: 'Arrival and access instructions.', prompt: 'What are the check-in instructions?',
    prompts: ['What time is check-in?', 'How do I get into the property?', 'Is early check-in possible?'],
  },
  {
    key: 'checkout', title: 'Check-out', description: 'Departure steps and timing.', prompt: 'What are the check-out instructions?',
    prompts: ['What time is check-out?', 'What are the check-out steps?', 'Is late check-out possible?'],
  },
  { key: 'local', title: 'Local recommendations', description: 'Approved places, directions, and links.', prompt: 'What local places do you recommend?', prompts: [] },
];

// The per-appliance question sheet. Templated from the appliance's display name
// so any inventory the host saves to the Brain instantly gets a useful sheet.
function appliancePrompts(a: Appliance): string[] {
  return [
    `How do I use the ${a.name}?`,
    `Where is the ${a.name} located?`,
    `How do I turn on the ${a.name}?`,
    `How do I clean or refill the ${a.name}?`,
    `The ${a.name} is not working — what should I do?`,
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
  onBack: () => void;
  onOpenHostChat: () => void;
  onSessionExpired: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [cards, setCards] = useState<AssistantCard[]>(props.hostPreview ? FALLBACK_CARDS : []);
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

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
        setPickerError(json.error || 'Could not load the appliance list.');
        setAppliances([]);
        return;
      }
      setAppliances(Array.isArray(json.appliances) ? json.appliances : []);
    } finally {
      setAppliancesLoading(false);
    }
  }, [props.slug, props.onSessionExpired]);

  async function syncEscalation(question: string, answer: string) {
    if (props.hostPreview) return;
    await fetch(`/api/guest/${props.slug}/host-chat/sync-escalation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, answer }),
    }).catch(() => undefined);
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

    try {
      const url = props.hostPreview
        ? `/api/host/properties/${props.propertyId}/preview-chat`
        : `/api/guest/${props.slug}/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.status === 401 && !props.hostPreview) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        return;
      }

      const answer = String(json.answer ?? 'I do not have a reliable answer for that.');
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
        }),
      });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPickerError(json.error || 'Could not notify your host just now.');
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
    <section aria-label="Ask a question">
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 className="gp-wf-title gp-title-row">
          <Sparkles size={20} aria-hidden /> Ask a Question
        </h2>
        <p className="gp-muted" style={{ margin: '.35rem 0 0' }}>
          Get property-safe answers. If the concierge is not confident, it will say so and ping your host instead of guessing.
        </p>
      </div>

      <AiDisclosure />

      {cards.length > 0 && (
        <div className="gp-assist-grid">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              className="gp-assist-card"
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
            I’m not confident I have the right answer, so I’ve pinged your host. Their reply will appear in Host Chat.
            <button type="button" onClick={props.onOpenHostChat} className="gp-msg-link" style={{ marginLeft: '.5rem' }}>
              Open Host Chat
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="gp-chat-panel">
        {messages.length === 0 ? (
          <p className="gp-muted">Choose a card above or ask anything about your stay.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`gp-msg-row ${message.role === 'user' ? 'gp-msg-row-user' : ''}`}>
              <div className={`gp-msg ${message.role === 'user' ? 'gp-msg-user' : message.role === 'host' ? 'gp-msg-host' : ''}`}>
                {message.role === 'host' && <div className="gp-msg-tag">Host reply</div>}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
                {message.isEmergency && <p className="gp-msg-emergency">If this is an emergency, contact local emergency services first.</p>}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="gp-alert-text">{error}</p>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
        className="gp-input-row"
        style={{ marginTop: '.85rem' }}
      >
        <label htmlFor="ai-chat-input" className="sr-only">Ask the concierge</label>
        <textarea
          id="ai-chat-input"
          className="gp-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about Wi-Fi, check-in, trash, local places…"
          rows={2}
          style={{ resize: 'vertical' }}
        />
        <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label="Ring the service bell">
          {busy ? <Loader2 size={18} className="gp-spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
        </button>
      </form>

      {activeCard && (
        <PortalModal title={activeCard.title} onClose={() => setActiveCard(null)}>
          <p className="gp-modal-sub">Pick a question — or type your own in the chat below.</p>
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
          title={activeAppliance ? activeAppliance.name : 'Which appliance?'}
          onClose={() => { setAppliancePickerOpen(false); setActiveAppliance(null); }}
        >
          {activeAppliance ? (
            <>
              <p className="gp-modal-sub">
                {[activeAppliance.brand, activeAppliance.locationNote].filter(Boolean).join(' · ') || 'Pick a question — or type your own in the chat.'}
              </p>
              <div className="gp-prompt-list">
                {appliancePrompts(activeAppliance).map((question) => (
                  <button key={question} type="button" className="gp-prompt-item" onClick={() => askFromSheet(question)}>
                    {question}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="gp-msg-link" onClick={() => setActiveAppliance(null)}>
                  Back to all appliances
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
                  placeholder="Search appliances…"
                  aria-label="Search appliances"
                />
              </div>

              {appliancesLoading ? (
                <p className="gp-muted"><Loader2 size={15} className="gp-spin" aria-hidden /> Loading appliances…</p>
              ) : appliances !== null && appliances.length === 0 ? (
                <div>
                  <p className="gp-modal-sub">
                    Your host hasn&apos;t listed any appliances for this property yet. Ping them and they can add
                    them in the Brain — or just ask your question in the chat and the concierge will escalate it
                    if it doesn&apos;t know.
                  </p>
                  {hostPinged ? (
                    <p className="gp-modal-sub" role="status">Your host has been pinged — their reply will appear in Host Chat.</p>
                  ) : (
                    <button type="button" className="gp-btn gp-btn-accent" onClick={() => void pingHostForAppliances()} disabled={busy}>
                      <ConciergeBell size={16} aria-hidden /> Ping the host
                    </button>
                  )}
                </div>
              ) : filteredAppliances.length === 0 ? (
                <p className="gp-muted">No appliances match “{applianceQuery}”.</p>
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
