'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ConciergeBell, Loader2, Send, TriangleAlert } from 'lucide-react';
import { linkify } from '@/lib/guest/linkify';

type ThreadMsg = {
  id: string;
  role: 'guest' | 'host' | 'system' | 'assistant';
  content: string;
  createdAt: string;
  messageKind: string;
  replyToMessageId: string | null;
  escalationId: string | null;
};

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

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// SMS-style guest ↔ host channel. AI escalations are first-class messages so the
// guest can tell the difference between an automated handoff and a human reply.
export function HostChatWorkflow(props: {
  slug: string;
  guestName: string | null;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/guest/${props.slug}/host-chat`, { cache: 'no-store' });
    if (res.status === 401) {
      props.onSessionExpired();
      return;
    }
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    setMessages(Array.isArray(json.messages) ? json.messages : []);
    setLoading(false);
  }, [props.slug, props.onSessionExpired]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/host-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, replyToMessageId: replyTo?.id }),
      });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not send your message.');
        return;
      }
      setInput('');
      setReplyTo(null);
      if (json.message) setMessages((current) => [...current, json.message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Host chat">
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Host Chat</h2>
        <p className="muted" style={{ margin: '.35rem 0 0' }}>
          Text your host directly{props.guestName ? `, ${props.guestName}` : ''}. AI escalations also appear here when the concierge needs a human answer.
        </p>
      </div>

      <div
        aria-live="polite"
        style={{
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 18,
          padding: '1rem',
          minHeight: 320,
          maxHeight: '52vh',
          overflowY: 'auto',
          background: 'rgba(255,255,255,.04)',
        }}
      >
        {loading ? (
          <p className="muted"><Loader2 size={16} className="spin" aria-hidden /> Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="muted">No messages yet. Send a note and your host will reply here.</p>
        ) : (
          messages.map((message) => {
            const mine = message.role === 'guest';
            const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
            return (
              <div key={message.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '.7rem' }}>
                <div
                  style={{
                    maxWidth: '82%',
                    borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    padding: '.75rem .85rem',
                    background: escalation
                      ? 'rgba(255, 138, 92, .16)'
                      : mine
                        ? 'linear-gradient(135deg, rgba(51,230,212,.28), rgba(124,140,255,.22))'
                        : 'rgba(255,255,255,.1)',
                    border: escalation ? '1px solid rgba(255,138,92,.45)' : '1px solid rgba(255,255,255,.1)',
                  }}
                >
                  {escalation && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.75rem', fontWeight: 700, marginBottom: '.35rem', color: '#ffb08f' }}>
                      <TriangleAlert size={14} aria-hidden /> AI escalation
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
                  <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.4rem', fontSize: '.72rem', opacity: .75 }}>
                    <span>{timeLabel(message.createdAt)}</span>
                    <button type="button" onClick={() => setReplyTo(message)} style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {replyTo && (
        <div style={{ marginTop: '.75rem', padding: '.65rem .75rem', borderRadius: 12, background: 'rgba(255,255,255,.08)', fontSize: '.85rem' }}>
          Replying to {replyTo.role === 'host' ? 'host' : 'message'}: “{replyTo.content.slice(0, 120)}{replyTo.content.length > 120 ? '…' : ''}”
          <button type="button" onClick={() => setReplyTo(null)} style={{ marginLeft: '.6rem', border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.85rem' }}>
        <label htmlFor="host-chat-input" className="sr-only">Message your host</label>
        <textarea
          id="host-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Write a message…"
          rows={2}
          style={{ flex: 1, resize: 'vertical', borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: 'inherit', padding: '.8rem' }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send message" style={{ minWidth: 48, borderRadius: 14 }}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden /> : <Send size={18} aria-hidden />}
        </button>
      </div>

      <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', marginTop: '.7rem' }}>
        <ConciergeBell size={14} aria-hidden /> Host replies arrive here; if you opted in, we’ll also send a neutral text prompt.
      </p>
    </section>
  );
}
