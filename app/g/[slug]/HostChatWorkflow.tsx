'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ConciergeBell, Loader2, Send } from 'lucide-react';

type ThreadMsg = {
  id: string;
  from: 'guest' | 'host';
  text: string;
  at: string;
  status?: 'waiting' | 'answered';
};

const POLL_MS = 8000;

// Workflow 2 — Message Host Directly. A human-only channel, visually and
// functionally distinct from the AI chat: different accent, explicit banner,
// no AI suggestions, no shared conversation. Backed by escalations with
// conversation_id NULL (see app/api/guest/[slug]/host-chat).
export function HostChatWorkflow(props: {
  slug: string;
  guestName: string | null;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${props.slug}/host-chat`);
      if (res.status === 401) { props.onSessionExpired(); return; }
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setLoaded(true);
    } catch {
      // Polling retries on the next tick.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput('');
    // Optimistic append; the next poll reconciles with the server thread.
    setMessages((m) => [...m, { id: `local-${Date.now()}`, from: 'guest', text: trimmed, at: new Date().toISOString(), status: 'waiting' }]);
    try {
      const res = await fetch(`/api/guest/${props.slug}/host-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.status === 401) { props.onSessionExpired(); return; }
      if (!res.ok) throw new Error('send_failed');
      await load();
    } catch {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, from: 'host', text: 'Your message could not be sent. Please try again.', at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Message host directly" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
        <span className="gp-wf-title">Message Host Directly</span>
      </div>

      <div className="gp-banner gp-banner-host" role="note">
        <ConciergeBell size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />
        You&apos;re messaging your host or property staff — a real person, not the AI assistant. Replies appear here.
      </div>

      <div className="gp-chat-list" ref={listRef} aria-live="polite">
        {loaded && messages.length === 0 ? (
          <div className="gp-empty">
            No messages yet. Say hello{props.guestName ? `, ${props.guestName}` : ''} — your host typically replies as soon as they can.
          </div>
        ) : null}
        {!loaded ? (
          <div className="gp-empty"><Loader2 size={18} className="gp-spin" aria-label="Loading messages" /></div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`gp-bubble ${m.from === 'guest' ? 'gp-bubble-user' : 'gp-bubble-host'}`}>
            <span className="gp-bubble-tag">{m.from === 'guest' ? 'You' : 'Host'}</span>
            {m.text}
            {m.from === 'guest' && m.status === 'waiting' ? (
              <span className="gp-bubble-meta"><span className="gp-badge gp-badge-waiting">Waiting for host reply</span></span>
            ) : null}
          </div>
        ))}
      </div>

      <form
        className="gp-input-row"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          className="gp-input"
          type="text"
          placeholder="Write to your host…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          maxLength={2000}
          aria-label="Message your host"
        />
        <button type="submit" className="gp-send gp-send-accent" disabled={busy || !input.trim()} aria-label="Send to host">
          <Send size={18} aria-hidden />
        </button>
      </form>
    </section>
  );
}
