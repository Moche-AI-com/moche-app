'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Brain, CheckCheck, Loader2, Megaphone, Send } from 'lucide-react';

type ChatMessage = {
  id: string;
  role: 'guest' | 'host' | 'system' | 'assistant';
  content: string;
  createdAt: string;
  messageKind: string;
  replyToMessageId: string | null;
  escalationId: string | null;
};

type ThreadEscalation = {
  id: string;
  question: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

function timeLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Scoped styles for the highlighted escalation Reply CTA. Kept local (the
// GuestPortal PORTAL_CSS pattern) so globals.css stays untouched.
const CONV_CSS = `
.conv-esc-reply {
  display: inline-flex; align-items: center; gap: .35rem;
  border: 0; border-radius: 999px; padding: .35rem .8rem;
  background: var(--coral); color: var(--btn-coral-fg);
  font-size: .78rem; font-weight: 700; cursor: pointer;
  animation: conv-pulse-coral 2.2s ease-out infinite;
  transition: transform .2s ease, background .2s ease;
}
.conv-esc-reply:hover { transform: translateY(-1px); background: var(--coral-soft); }
@keyframes conv-pulse-coral {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--coral) 45%, transparent); }
  50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--coral) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .conv-esc-reply { animation: none; }
  .conv-esc-reply:hover { transform: none; }
}
`;

// Full-page host ↔ guest thread. Escalations are the guided path: an
// unresolved escalation carries a highlighted, pulsing Reply CTA, and the
// anchored composer offers "Mark handled" and "Teach the Brain" inline.
export function ConversationThread({
  propertyId,
  conversationId,
  canLearn,
}: {
  propertyId: string;
  conversationId: string;
  canLearn: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [escalations, setEscalations] = useState<ThreadEscalation[]>([]);
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [markHandled, setMarkHandled] = useState(true);
  const [learnFromReply, setLearnFromReply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const escalationById = useMemo(() => new Map(escalations.map((e) => [e.id, e])), [escalations]);
  const openEscalations = escalations.filter((e) => e.status !== 'resolved');

  const load = useCallback(async () => {
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/${conversationId}/messages`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setEscalations(Array.isArray(json.escalations) ? json.escalations : []);
      setError(null);
    } else {
      setError(json.error || 'Could not load messages.');
    }
    setLoading(false);
  }, [propertyId, conversationId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function startReply(message: ChatMessage) {
    setReplyTo(message);
    // Replying to an escalation defaults to marking it handled — the host can
    // opt out with the chip when the reply is a clarifying question.
    setMarkHandled(Boolean(message.escalationId || message.messageKind === 'ai_escalation'));
    setLearnFromReply(false);
    setNotice(null);
    composerRef.current?.focus();
  }

  function cancelReply() {
    setReplyTo(null);
    setMarkHandled(true);
    setLearnFromReply(false);
  }

  async function sendReply() {
    if (!reply.trim() || sending) return;
    setSending(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: reply.trim(),
          replyToMessageId: replyTo?.id,
          resolveEscalation: replyTo?.escalationId ? markHandled : false,
          learnFromReply: replyTo?.escalationId ? learnFromReply : false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not send the reply.');
        return;
      }
      setReply('');
      cancelReply();
      if (json.message) setMessages((current) => [...current, json.message]);
      if (json.learningQueued) setNotice('Reply sent. A normalized Brain update is waiting in the approval queue.');
      if (json.learningError) setNotice(`Reply sent, but the Brain update could not be queued: ${json.learningError}`);
      void load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <style>{CONV_CSS}</style>

      {openEscalations.length > 0 && (
        <div className="chat-banner-escalation" role="status">
          <AlertTriangle size={14} aria-hidden />
          {openEscalations.length} unresolved escalation{openEscalations.length === 1 ? '' : 's'} in this thread — use the highlighted Reply button on an escalated message to answer it.
        </div>
      )}

      <div aria-live="polite" className="chat-messages" style={{ maxHeight: 'none', minHeight: 320, flex: 1 }}>
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="muted">No messages yet.</p>
        ) : (
          messages.map((message) => {
            const host = message.role === 'host';
            const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
            const esc = message.escalationId ? escalationById.get(message.escalationId) ?? null : null;
            const unresolved = escalation && (!esc || esc.status !== 'resolved');
            return (
              <div key={message.id} className={`bubble-row${host ? ' bubble-row-host' : ''}`}>
                <div className={`bubble${host ? ' bubble-host' : ' bubble-guest'}${escalation ? ' bubble-escalation' : ''}`}>
                  {escalation && (
                    <div className="bubble-flag bubble-flag-escalation">
                      <AlertTriangle size={13} aria-hidden /> AI escalation
                      {esc && (
                        <span style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          · {esc.status === 'resolved' ? 'handled' : esc.status}
                        </span>
                      )}
                    </div>
                  )}
                  {message.messageKind === 'announcement' && <div className="bubble-flag bubble-flag-announcement"><Megaphone size={13} aria-hidden /> Announcement</div>}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  <div className="bubble-meta">
                    <span>{timeLabel(message.createdAt)}</span>
                    {unresolved ? (
                      <button type="button" className="conv-esc-reply" onClick={() => startReply(message)} data-testid={`reply-escalation-${message.id}`}>
                        <AlertTriangle size={12} aria-hidden /> Reply to escalation
                      </button>
                    ) : (
                      <button type="button" className="bubble-reply" onClick={() => startReply(message)}>Reply</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {replyTo && (
        <div className="chat-reply-quote">
          <div style={{ fontSize: '.84rem' }}>
            {replyTo.escalationId ? 'Replying to escalation' : 'Replying to'}: “{replyTo.content.slice(0, 140)}{replyTo.content.length > 140 ? '…' : ''}”
          </div>
          <button type="button" className="bubble-reply" onClick={cancelReply} style={{ marginTop: '.55rem' }}>
            Cancel reply
          </button>
        </div>
      )}

      {replyTo?.escalationId && (
        <div className="chip-row">
          <button
            type="button"
            className={`chip-toggle chip-coral${markHandled ? ' is-on' : ''}`}
            aria-pressed={markHandled}
            title="Closes the escalation when your reply sends. Leave it off if you're asking a follow-up question."
            onClick={() => setMarkHandled((value) => !value)}
            data-testid="chip-mark-handled"
          >
            <CheckCheck size={13} aria-hidden /> Mark handled on send
          </button>
          {canLearn && (
            <button
              type="button"
              className={`chip-toggle${learnFromReply ? ' is-on' : ''}`}
              aria-pressed={learnFromReply}
              title="A strong model normalizes this escalation thread into a pending Brain update. Nothing changes until you approve it in the Brain review queue."
              onClick={() => setLearnFromReply((value) => !value)}
              data-testid="chip-teach-brain"
            >
              <Brain size={13} aria-hidden /> Teach the Brain
            </button>
          )}
        </div>
      )}

      {notice && <p role="status" style={{ color: 'var(--teal)', margin: '0 1rem .75rem' }}>{notice}</p>}
      {error && <p role="alert" style={{ color: 'var(--coral)', margin: '0 1rem .75rem' }}>{error}</p>}

      <div className="chat-composer">
        <label htmlFor="guest-chat-reply" className="sr-only">Reply to guest</label>
        <textarea ref={composerRef} id="guest-chat-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} placeholder="Write a clear, guest-ready reply…" />
        <button type="button" className="chat-composer-send" onClick={() => void sendReply()} disabled={sending || !reply.trim()} aria-label="Send reply" data-testid="send-reply">
          {sending ? <Loader2 size={16} className="spin" aria-hidden /> : <Send size={16} aria-hidden />}
        </button>
      </div>

      <div className="muted" style={{ padding: '0 1rem .9rem', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
        <CheckCheck size={13} aria-hidden /> This thread marks itself read while open. Escalations stay pinned until you mark them handled.
      </div>
    </div>
  );
}
