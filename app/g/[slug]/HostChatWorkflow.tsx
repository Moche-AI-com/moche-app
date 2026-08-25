'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ConciergeBell, Loader2, TriangleAlert } from 'lucide-react';
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

// SMS-style guest ↔ host channel. AI escalations are first-class: the escalated
// question stays inline, and the host's response folds into a card beneath it —
// tap the down arrow to read, or hit the highlighted Reply to answer on that
// escalation thread. Replies stay attached to the escalation so the AI can
// learn from the exchange instead of re-reading the whole conversation.
// The send action is the concierge service bell everywhere in the portal — one
// brand gesture for "ask for help".
export function HostChatWorkflow(props: {
  slug: string;
  guestName: string | null;
  // The guest's portal language (Globe picker). Sent with each message so the
  // host receives an auto-translation alongside the original.
  language?: string | null;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
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

  // Host/system responses attach to their escalation via escalationId and render
  // inside the escalation's card, not as loose bubbles in the main stream.
  const escalationReplies = useMemo(() => {
    const map = new Map<string, ThreadMsg[]>();
    for (const message of messages) {
      if (message.escalationId && message.role !== 'guest') {
        const list = map.get(message.escalationId) ?? [];
        list.push(message);
        map.set(message.escalationId, list);
      }
    }
    return map;
  }, [messages]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/host-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          replyToMessageId: replyTo?.id,
          escalationId: replyTo?.escalationId ?? undefined,
          language: props.language ?? undefined,
        }),
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

  function renderBubble(message: ThreadMsg) {
    const mine = message.role === 'guest';
    const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
    return (
      <div className={`gp-msg-row ${mine ? 'gp-msg-row-user' : ''}`}>
        <div className={`gp-msg ${mine ? 'gp-msg-user' : ''} ${escalation ? 'gp-msg-escalation' : ''} ${!mine && !escalation ? 'gp-msg-host' : ''}`}>
          {escalation && (
            <div className="gp-msg-tag">
              <TriangleAlert size={14} aria-hidden /> AI escalation
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
          <div className="gp-msg-meta">
            <span>{timeLabel(message.createdAt)}</span>
            <button type="button" onClick={() => setReplyTo(message)} className="gp-msg-link">
              Reply
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Host chat">
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 className="gp-wf-title" style={{ margin: 0 }}>Host Chat</h2>
        <p className="gp-muted" style={{ margin: '.35rem 0 0' }}>
          Text your host directly{props.guestName ? `, ${props.guestName}` : ''}. AI escalations also appear here when the concierge needs a human answer.
        </p>
      </div>

      <div aria-live="polite" className="gp-chat-panel" style={{ minHeight: 320, maxHeight: '52vh' }}>
        {loading ? (
          <p className="gp-muted"><Loader2 size={16} className="gp-spin" aria-hidden /> Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="gp-muted">No messages yet. Send a note and your host will reply here.</p>
        ) : (
          messages.map((message) => {
            // Escalation responses render inside the card under their anchor.
            if (message.escalationId && message.role !== 'guest') return null;
            const isAnchor = message.messageKind === 'ai_escalation' && Boolean(message.escalationId);
            const replies = isAnchor ? escalationReplies.get(message.escalationId!) ?? [] : [];
            return (
              <div key={message.id}>
                {renderBubble(message)}
                {isAnchor && replies.length > 0 && (
                  <EscalationResponses
                    replies={replies}
                    open={openCards[message.escalationId!] === true}
                    onToggle={() =>
                      setOpenCards((current) => ({ ...current, [message.escalationId!]: !current[message.escalationId!] }))
                    }
                    onReply={() => setReplyTo(message)}
                  />
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {replyTo && (
        <div className="gp-card" style={{ marginTop: '.75rem', padding: '.65rem .75rem', fontSize: '.85rem' }}>
          {replyTo.escalationId
            ? `Replying on this escalation — your answer stays attached to that thread: “${replyTo.content.slice(0, 120)}${replyTo.content.length > 120 ? '…' : ''}”`
            : `Replying to ${replyTo.role === 'host' ? 'host' : 'message'}: “${replyTo.content.slice(0, 120)}${replyTo.content.length > 120 ? '…' : ''}”`}
          <button type="button" onClick={() => setReplyTo(null)} className="gp-msg-link" style={{ marginLeft: '.6rem' }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert" className="gp-alert-text">{error}</p>}

      <div className="gp-input-row" style={{ marginTop: '.85rem' }}>
        <label htmlFor="host-chat-input" className="sr-only">Message your host</label>
        <textarea
          id="host-chat-input"
          className="gp-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Write a message…"
          rows={2}
          style={{ resize: 'vertical' }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="gp-send" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Ring the service bell">
          {busy ? <Loader2 size={18} className="gp-spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
        </button>
      </div>

      <p className="gp-muted" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', marginTop: '.7rem' }}>
        <ConciergeBell size={14} aria-hidden /> Host replies arrive here; if you opted in, we’ll also send a neutral text prompt.
      </p>
    </section>
  );
}

// The host's response to an escalation, folded behind a down-arrow so the main
// chat stays readable. The highlighted Reply keeps the guest's answer attached
// to the escalation thread. Colors ride the portal's semantic variables so the
// card stays readable in both themes.
function EscalationResponses(props: { replies: ThreadMsg[]; open: boolean; onToggle: () => void; onReply: () => void }) {
  return (
    <div style={{ margin: '-.35rem 0 .7rem', borderRadius: 14, border: '1px solid var(--gp-accent-soft-border)', background: 'var(--gp-accent-soft-bg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.55rem .75rem' }}>
        <button
          type="button"
          onClick={props.onToggle}
          aria-expanded={props.open}
          style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flex: 1, minWidth: 0, border: 0, background: 'none', color: 'var(--gp-accent-text)', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          <ChevronDown size={15} aria-hidden style={{ transform: props.open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease', flexShrink: 0 }} />
          Your host replied to this escalation ({props.replies.length})
        </button>
        <button
          type="button"
          onClick={props.onReply}
          style={{ border: 0, borderRadius: 999, padding: '.4rem .9rem', background: 'var(--gp-accent)', color: 'var(--gp-on-accent)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', flexShrink: 0 }}
        >
          Reply
        </button>
      </div>
      {props.open && (
        <div style={{ padding: '0 .75rem .65rem', display: 'grid', gap: '.5rem' }}>
          {props.replies.map((reply) => (
            <div key={reply.id} style={{ background: 'var(--gp-ghost-bg)', borderRadius: 10, padding: '.55rem .65rem', fontSize: '.9rem', lineHeight: 1.45 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}><LinkedText text={reply.content} /></div>
              <div style={{ fontSize: '.7rem', color: 'var(--gp-faint)', marginTop: '.3rem' }}>{timeLabel(reply.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
