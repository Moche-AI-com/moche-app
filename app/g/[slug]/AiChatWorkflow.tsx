'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'host';
  content: string;
  isEmergency?: boolean;
  escalated?: boolean;
};

let counter = 0;
const nextId = () => `m-${Date.now()}-${counter++}`;

const POLL_MS = 8000;

// Workflow 1 — Ask Questions. AI-only concierge chat with quick-reply
// suggestions. The concierge itself never becomes a human channel — but when
// confidence is low it escalates to the host (server-side, unchanged), and the
// host's answer appears right here, clearly labeled as coming from a person.
// Guest-initiated host conversations live in the separate Message Host
// Directly workflow.
export function AiChatWorkflow(props: {
  slug: string;
  propertyId: string;
  hostPreview: boolean;
  onBack: () => void;
  onOpenHostChat: () => void;
  onSessionExpired: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string | null>(null);
  const seenHostRef = useRef<Set<string>>(new Set());

  const hostKey = (m: { content: string; created_at?: string }) => `${m.created_at ?? ''}|${m.content}`;

  // Seed from the existing conversation history, then poll for host replies.
  // Guest/assistant turns arrive synchronously via the chat POST, so polling
  // only appends host messages (the async escalation answers).
  useEffect(() => {
    if (props.hostPreview) return;
    let cancelled = false;

    async function seed() {
      try {
        const res = await fetch(`/api/guest/${props.slug}/messages`);
        if (res.status === 401) { props.onSessionExpired(); return; }
        if (!res.ok) return;
        const json = await res.json();
        const history: { role: string; content: string; created_at: string }[] = json.messages ?? [];
        if (cancelled) return;
        const usable = history.filter((m) => m.role === 'guest' || m.role === 'assistant' || m.role === 'host');
        for (const m of usable) if (m.role === 'host') seenHostRef.current.add(hostKey(m));
        setMessages(usable.map((m) => ({
          id: nextId(),
          role: m.role === 'guest' ? 'user' : m.role === 'host' ? 'host' : 'assistant',
          content: m.content,
        })));
        const last = usable[usable.length - 1];
        if (last?.created_at) lastSeenRef.current = last.created_at;
      } catch {
        // History is best-effort; the chat works without it.
      }
    }

    async function poll() {
      try {
        const qs = lastSeenRef.current ? `?after=${encodeURIComponent(lastSeenRef.current)}` : '';
        const res = await fetch(`/api/guest/${props.slug}/messages${qs}`);
        if (res.status === 401) { props.onSessionExpired(); return; }
        if (!res.ok) return;
        const json = await res.json();
        const incoming: { role: string; content: string; created_at: string }[] = json.messages ?? [];
        if (cancelled || incoming.length === 0) return;
        const fresh = incoming.filter((m) => m.role === 'host' && !seenHostRef.current.has(hostKey(m)));
        for (const m of fresh) seenHostRef.current.add(hostKey(m));
        const last = incoming[incoming.length - 1];
        if (last?.created_at) lastSeenRef.current = last.created_at;
        if (fresh.length > 0) {
          setMessages((prev) => [...prev, ...fresh.map((m) => ({ id: nextId(), role: 'host' as const, content: m.content }))]);
        }
      } catch {
        // Polling retries on the next tick.
      }
    }

    void seed();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput('');
    setSuggestions([]);
    setMessages((m) => [...m, { id: nextId(), role: 'user', content: trimmed }]);
    try {
      // Host preview uses the read-only host preview endpoint; guests use the
      // normal concierge chat endpoint. Response shapes match.
      const url = props.hostPreview
        ? `/api/host/properties/${props.propertyId}/preview-chat`
        : `/api/guest/${props.slug}/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.status === 401 && !props.hostPreview) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.answer !== 'string') {
        throw new Error(typeof json.error === 'string' ? json.error : 'chat_failed');
      }
      setMessages((m) => [...m, {
        id: nextId(),
        role: 'assistant',
        content: json.answer,
        isEmergency: json.isEmergency === true,
        escalated: json.escalated === true,
      }]);
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 3) : []);
    } catch {
      setMessages((m) => [...m, {
        id: nextId(),
        role: 'assistant',
        content: 'Sorry — something went wrong. Please try again.',
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy, props]);

  return (
    <section aria-label="Ask questions" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
        <span className="gp-wf-title">Ask Questions</span>
      </div>

      <AiDisclosure variant="banner" />

      <div className="gp-chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="gp-empty">
            Ask me anything about your stay — Wi-Fi, check-in instructions, appliances, or what to do nearby.
          </div>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`gp-bubble ${m.role === 'user' ? 'gp-bubble-user' : m.role === 'host' ? 'gp-bubble-host' : 'gp-bubble-assistant'} ${m.isEmergency ? 'gp-bubble-emergency' : ''}`}
          >
            {m.role === 'assistant' ? <span className="gp-bubble-tag">AI Concierge</span> : null}
            {m.role === 'host' ? <span className="gp-bubble-tag">Host</span> : null}
            {m.content}
            {m.isEmergency ? (
              <span className="gp-bubble-meta">If this is an emergency, contact local emergency services first.</span>
            ) : null}
            {m.escalated && !props.hostPreview ? (
              <span className="gp-bubble-meta">
                I&apos;ve flagged this for your host — their answer will appear here.{' '}
                <button type="button" className="gp-chip" style={{ marginTop: 6 }} onClick={props.onOpenHostChat}>
                  Message your host directly
                </button>
              </span>
            ) : null}
          </div>
        ))}
        {busy ? <div className="gp-bubble gp-bubble-assistant"><Loader2 size={16} className="gp-spin" aria-label="Thinking" /></div> : null}
      </div>

      {suggestions.length > 0 ? (
        <div className="gp-chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className="gp-chip" onClick={() => void send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="gp-input-row"
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
      >
        <input
          className="gp-input"
          type="text"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          maxLength={2000}
          aria-label="Ask the AI concierge"
        />
        <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={18} aria-hidden />
        </button>
      </form>
    </section>
  );
}
