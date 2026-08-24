'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ConciergeBell, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
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
              onClick={() => void sendMessage(card.prompt)}
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
    </section>
  );
}
