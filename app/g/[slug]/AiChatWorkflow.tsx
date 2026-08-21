'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ConciergeBell, Loader2, MapPin, Sparkles, TriangleAlert } from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { linkify } from '@/lib/guest/linkify';

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
};

const FALLBACK_CARDS: AssistantCard[] = [
  { key: 'wifi', title: 'Wi-Fi', description: 'Network and connection help.', prompt: 'What is the Wi-Fi network and password?' },
  { key: 'checkin', title: 'Check-in', description: 'Arrival and access instructions.', prompt: 'What are the check-in instructions?' },
  { key: 'checkout', title: 'Check-out', description: 'Departure steps and timing.', prompt: 'What are the check-out instructions?' },
  { key: 'local', title: 'Local recommendations', description: 'Approved places, directions, and links.', prompt: 'What local places do you recommend?' },
];

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

export function AiChatWorkflow(props: {
  slug: string;
  propertyId: string;
  hostPreview: boolean;
  onBack: () => void;
  onOpenHostChat: () => void;
  onSessionExpired: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [cards, setCards] = useState<AssistantCard[]>(props.hostPreview ? FALLBACK_CARDS : []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalationNotice, setEscalationNotice] = useState(false);
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

  return (
    <section aria-label="Ask a question">
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.45rem' }}>
          <Sparkles size={20} aria-hidden /> Ask a Question
        </h2>
        <p className="muted" style={{ margin: '.35rem 0 0' }}>
          Get property-safe answers. If the concierge is not confident, it will say so and ping your host instead of guessing.
        </p>
      </div>

      <AiDisclosure />

      {cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '.65rem', margin: '1rem 0' }}>
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => void sendMessage(card.prompt)}
              disabled={busy}
              style={{
                textAlign: 'left',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 16,
                padding: '.8rem',
                background: 'rgba(255,255,255,.055)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 700 }}>
                {card.key === 'local' ? <MapPin size={15} aria-hidden /> : <Sparkles size={15} aria-hidden />}
                {card.title}
              </span>
              <span className="muted" style={{ display: 'block', fontSize: '.78rem', marginTop: '.35rem' }}>{card.description}</span>
            </button>
          ))}
        </div>
      )}

      {escalationNotice && (
        <div role="status" style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', border: '1px solid rgba(255,138,92,.45)', background: 'rgba(255,138,92,.14)', borderRadius: 14, padding: '.75rem', marginBottom: '.85rem' }}>
          <TriangleAlert size={17} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            I’m not confident I have the right answer, so I’ve pinged your host. Their reply will appear in Host Chat.
            <button type="button" onClick={props.onOpenHostChat} style={{ marginLeft: '.5rem', border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
              Open Host Chat
            </button>
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        style={{
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 18,
          padding: '1rem',
          minHeight: 300,
          maxHeight: '48vh',
          overflowY: 'auto',
          background: 'rgba(255,255,255,.04)',
        }}
      >
        {messages.length === 0 ? (
          <p className="muted">Choose a card above or ask anything about your stay.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '.7rem' }}>
              <div
                style={{
                  maxWidth: '84%',
                  borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding: '.75rem .85rem',
                  background: message.role === 'user'
                    ? 'linear-gradient(135deg, rgba(51,230,212,.28), rgba(124,140,255,.22))'
                    : message.role === 'host'
                      ? 'rgba(255,138,92,.16)'
                      : 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.1)',
                }}
              >
                {message.role === 'host' && <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: '.3rem', color: '#ffb08f' }}>Host reply</div>}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
                {message.isEmergency && <p style={{ margin: '.45rem 0 0', fontSize: '.78rem', color: '#ffb08f' }}>If this is an emergency, contact local emergency services first.</p>}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
        style={{ display: 'flex', gap: '.5rem', marginTop: '.85rem' }}
      >
        <label htmlFor="ai-chat-input" className="sr-only">Ask the concierge</label>
        <textarea
          id="ai-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about Wi-Fi, check-in, trash, local places…"
          rows={2}
          style={{ flex: 1, resize: 'vertical', borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: 'inherit', padding: '.8rem' }}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Ring the service bell" style={{ minWidth: 52, borderRadius: 14 }}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
        </button>
      </form>
    </section>
  );
}
