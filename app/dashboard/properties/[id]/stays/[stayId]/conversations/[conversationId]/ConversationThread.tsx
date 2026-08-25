'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Brain, CheckCheck, Languages, Loader2, Megaphone, Send } from 'lucide-react';

type ChatMessage = {
  id: string;
  role: 'guest' | 'host' | 'system' | 'assistant';
  content: string;
  createdAt: string;
  messageKind: string;
  replyToMessageId: string | null;
  escalationId: string | null;
  // Auto-translation of a guest's message into the host's language (the guest
  // picked a language in the portal). The original above is always preserved.
  hostTranslation?: string | null;
  hostTranslationLang?: string | null;
};

type ThreadEscalation = {
  id: string;
  question: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

// Host-facing labels for the escalation lifecycle. The stored enum values stay
// open/answered/resolved/dismissed; only the words change.
const ESCALATION_STATUS_LABEL: Record<string, string> = {
  open: 'needs answer',
  answered: 'awaiting guest',
  resolved: 'handled',
  dismissed: 'cancelled',
};

type EscalationOutcome = 'resolved' | 'answered' | 'dismissed';

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
.conv-esc-outcome {
  border: 0; background: transparent; color: inherit; font: inherit;
  font-size: .78rem; font-weight: 700; cursor: pointer; padding: 0;
}
@media (prefers-reduced-motion: reduce) {
  .conv-esc-reply { animation: none; }
  .conv-esc-reply:hover { transform: none; }
}
`;

// Full-page host ↔ guest thread. Escalations are the guided path: an
// unresolved escalation carries a highlighted, pulsing Reply CTA, and the
// anchored composer offers an outcome dropdown (Handled / Awaiting guest
// response / Cancelled) and "Teach the Brain" inline.
export function ConversationThread({
  propertyId,
  conversationId,
  canLearn,
  initialEscalationId = null,
}: {
  propertyId: string;
  conversationId: string;
  canLearn: boolean;
  initialEscalationId?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [escalations, setEscalations] = useState<ThreadEscalation[]>([]);
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [activeEscalation, setActiveEscalation] = useState<ThreadEscalation | null>(null);
  const [escalationOutcome, setEscalationOutcome] = useState<EscalationOutcome>('resolved');
  const [learnFromReply, setLearnFromReply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const autoOpenRef = useRef(false);

  const escalationById = useMemo(
    () => new Map<string, ThreadEscalation>(escalations.map((e): [string, ThreadEscalation] => [e.id, e])),
    [escalations],
  );
  const openEscalations = escalations.filter((e) => e.status !== 'resolved' && e.status !== 'dismissed');

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

  // Deep-linked from the Escalations inbox (?escalation=<id>): open the composer
  // on that escalation once the thread has loaded. When no message in this thread
  // carries it (the question started in the AI chat), the escalation itself
  // becomes the reply target instead of a message.
  useEffect(() => {
    if (autoOpenRef.current || !initialEscalationId || loading) return;
    const esc = escalations.find((e) => e.id === initialEscalationId);
    if (!esc) return;
    autoOpenRef.current = true;
    const message = messages.find((m) => m.escalationId === initialEscalationId);
    if (message) {
      setReplyTo(message);
    } else {
      setActiveEscalation(esc);
    }
    setEscalationOutcome('resolved');
    setLearnFromReply(false);
    setNotice(null);
    composerRef.current?.focus();
  }, [initialEscalationId, escalations, messages, loading]);

  function startReply(message: ChatMessage) {
    setReplyTo(message);
    // Replying to an escalation defaults to marking it handled — the host can
    // switch the outcome with the dropdown when the reply is a follow-up question.
    setEscalationOutcome('resolved');
    setLearnFromReply(false);
    setActiveEscalation(null);
    setNotice(null);
    composerRef.current?.focus();
  }

  function cancelReply() {
    setReplyTo(null);
    setActiveEscalation(null);
    setEscalationOutcome('resolved');
    setLearnFromReply(false);
  }

  // The escalation this reply acts on: either the replied-to message's
  // escalation, or the escalation opened directly from the inbox deep link.
  const replyEscalationId = replyTo?.escalationId ?? activeEscalation?.id ?? null;

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
          escalationId: replyEscalationId ?? undefined,
          escalationOutcome: replyEscalationId ? escalationOutcome : undefined,
          learnFromReply: replyEscalationId ? learnFromReply : false,
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
            const unresolved = escalation && (!esc || (esc.status !== 'resolved' && esc.status !== 'dismissed'));
            return (
              <div key={message.id} className={`bubble-row${host ? ' bubble-row-host' : ''}`}>
                <div className={`bubble${host ? ' bubble-host' : ' bubble-guest'}${escalation ? ' bubble-escalation' : ''}`}>
                  {escalation && (
                    <div className="bubble-flag bubble-flag-escalation">
                      <AlertTriangle size={13} aria-hidden /> AI escalation
                      {esc && (
                        <span style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          · {ESCALATION_STATUS_LABEL[esc.status] ?? esc.status}
                        </span>
                      )}
                    </div>
                  )}
                  {message.messageKind === 'announcement' && <div className="bubble-flag bubble-flag-announcement"><Megaphone size={13} aria-hidden /> Announcement</div>}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  {message.role === 'guest' && message.hostTranslation ? (
                    <div
                      className="muted"
                      style={{ marginTop: '.45rem', paddingTop: '.45rem', borderTop: '1px dashed rgba(128,128,128,.35)', fontSize: '.8rem', display: 'flex', gap: '.35rem', alignItems: 'flex-start' }}
                    >
                      <Languages size={12} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ whiteSpace: 'pre-wrap' }}>{message.hostTranslation}</span>
                    </div>
                  ) : null}
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

      {activeEscalation && !replyTo && (
        <div className="chat-reply-quote">
          <div style={{ fontSize: '.84rem' }}>
            Replying to escalation: “{activeEscalation.question.slice(0, 140)}{activeEscalation.question.length > 140 ? '…' : ''}”
          </div>
          <button type="button" className="bubble-reply" onClick={cancelReply} style={{ marginTop: '.55rem' }}>
            Cancel reply
          </button>
        </div>
      )}

      {replyEscalationId && (
        <div className="chip-row">
          <label
            className="chip-toggle chip-coral is-on"
            title="What happens to the escalation when your reply sends. Pick Awaiting guest response if you're asking them something back, or Cancelled for a duplicate."
            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}
          >
            <CheckCheck size={13} aria-hidden />
            <select
              className="conv-esc-outcome"
              value={escalationOutcome}
              onChange={(event) => setEscalationOutcome(event.target.value as EscalationOutcome)}
              aria-label="Escalation outcome when the reply sends"
              data-testid="select-escalation-outcome"
            >
              <option value="resolved">Handled</option>
              <option value="answered">Awaiting guest response</option>
              <option value="dismissed">Cancelled</option>
            </select>
          </label>
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
