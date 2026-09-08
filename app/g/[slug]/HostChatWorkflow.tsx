'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ConciergeBell, Loader2, TriangleAlert } from 'lucide-react';
import { linkify } from '@/lib/guest/linkify';
import type { PortalT } from '@/lib/guest/portal-strings';
import { GuestMessagingSetup } from './GuestMessagingSetup';
import { messageNotificationNotice } from '@/lib/notifications/message-notice';

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
// brand gesture for "ask for help" — now sitting in a floating pill composer
// with Enter-to-send, like the messaging apps guests already know.
//
// Host preview: no polling and no real thread. Sends go to the sandbox endpoint
// (which writes nothing and notifies nobody), and a clearly-marked auto-reply
// shows how a host response renders in the thread.
export function HostChatWorkflow(props: {
  slug: string;
  propertyId?: string;
  hostPreview?: boolean;
  guestName: string | null;
  initialConversationId?: string | null;
  initialMessageId?: string | null;
  // The guest's portal language (Globe picker). Sent with each message so the
  // host receives an auto-translation alongside the original.
  language?: string | null;
  t: PortalT;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = props;
  const hostPreview = props.hostPreview === true;
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!hostPreview);
  const [error, setError] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(hostPreview);
  const [conversationId, setConversationId] = useState(props.initialConversationId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const focusedRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    // Preview has no server thread to load or poll.
    if (hostPreview) {
      setLoading(false);
      return;
    }
    try {
    const query = new URLSearchParams();
    if (props.initialConversationId) query.set('conversation', props.initialConversationId);
    if (props.initialMessageId) query.set('message', props.initialMessageId);
    const res = await fetch(`/api/guest/${props.slug}/host-chat?${query}`, { cache: 'no-store' });
    if (res.status === 401) {
      props.onSessionExpired();
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCanSend(false);
      setRecoveryRequired(json.code === 'RECOVERY_REQUIRED');
      setRecoveryReady(json.recoveryReady === true);
      setMessages([]);
      setError(json.error || t('hostError')); setLoading(false); return;
    }
    setRecoveryRequired(false);
    setError(null);
    setCanSend(json.canSend === true);
    setConversationId(json.conversationId ?? null);
    setMessages(Array.isArray(json.messages) ? json.messages : []);
    setLoading(false);
    } catch { setError('Could not refresh messages.'); setCanSend(false); setLoading(false); }
  }, [hostPreview, props.slug, props.initialConversationId, props.initialMessageId, props.onSessionExpired, t]);

  useEffect(() => {
    if (hostPreview) return;
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load, hostPreview]);

  useEffect(() => {
    const hasNewMessages = lastMessageCountRef.current !== messages.length;
    lastMessageCountRef.current = messages.length;
    if (props.initialMessageId && !focusedRef.current) {
      const target = messages.find((m) => m.id === props.initialMessageId);
      if (target?.escalationId && !openCards[target.escalationId]) {
        setOpenCards((cards) => ({ ...cards, [target.escalationId!]: true }));
        return;
      }
      const el = document.getElementById(`message-${props.initialMessageId}`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); focusedRef.current = true; }
      return;
    }
    if (hasNewMessages) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, openCards, props.initialMessageId]);

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

  function growComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function recoverConversation() {
    if (recovering || !recoveryReady || !props.initialConversationId || !props.initialMessageId) return;
    setRecovering(true);
    setError(null);
    try {
      const response = await fetch(`/api/guest/${props.slug}/host-chat/recover`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: props.initialConversationId, messageId: props.initialMessageId, confirm: true }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (json.code === 'PHONE_PROOF_REQUIRED') setRecoveryReady(false);
        setError(json.error || 'Could not open this conversation.');
        return;
      }
      focusedRef.current = false;
      await load();
    } catch { setError('Could not confirm recovery. Refresh before trying again.'); }
    finally { setRecovering(false); }
  }

  async function send() {
    const message = input.trim();
    if (!message || busy || !canSend) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        hostPreview ? `/api/host/properties/${props.propertyId}/preview-host-chat` : `/api/guest/${props.slug}/host-chat`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            replyToMessageId: replyTo?.id,
            escalationId: replyTo?.escalationId ?? undefined,
            language: props.language ?? undefined,
            conversationId: conversationId ?? undefined,
          }),
        },
      );
      if (res.status === 401 && !hostPreview) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || t('hostError'));
        return;
      }
      setInput('');
      setReplyTo(null);
      if (inputRef.current) inputRef.current.style.height = 'auto';
      if (json.message) setMessages((current) => [...current, json.message]);
      if (!hostPreview) setNotice([messageNotificationNotice(json.notification?.sms), ...(Array.isArray(json.workflowWarnings) ? json.workflowWarnings : [])].join(' '));
      if (hostPreview) {
        // Show the host how a reply renders, clearly marked as simulated.
        window.setTimeout(() => {
          setMessages((current) => [
            ...current,
            {
              id: `preview-reply-${crypto.randomUUID()}`,
              role: 'host',
              content: t('hostPreviewAutoReply'),
              createdAt: new Date().toISOString(),
              messageKind: 'text',
              replyToMessageId: null,
              escalationId: null,
            },
          ]);
        }, 900);
      }
    } catch {
      setError('Could not confirm whether the message was saved. Refresh before resending.');
    } finally {
      setBusy(false);
    }
  }

  function renderBubble(message: ThreadMsg) {
    const mine = message.role === 'guest';
    const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
    return (
      <div id={`message-${message.id}`} tabIndex={-1} className={`gp-msg-row ${mine ? 'gp-msg-row-user' : ''}`}>
        <div className={`gp-msg ${mine ? 'gp-msg-user' : ''} ${escalation ? 'gp-msg-escalation' : ''} ${!mine && !escalation ? 'gp-msg-host' : ''}`}>
          {escalation && (
            <div className="gp-msg-tag">
              <TriangleAlert size={14} aria-hidden /> {t('hostEscTag')}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}><LinkedText text={message.content} /></div>
          <div className="gp-msg-meta">
            <span>{timeLabel(message.createdAt)}</span>
            <button type="button" onClick={() => setReplyTo(message)} className="gp-msg-link">
              {t('reply')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section aria-label={t('hostTitle')}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> {t('menu')}
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h2 className="gp-wf-title" style={{ margin: 0 }}>{t('hostTitle')}</h2>
        <p className="gp-muted" style={{ margin: '.35rem 0 0' }}>
          {t('hostSub', { name: props.guestName ? `, ${props.guestName}` : '' })}
        </p>
      </div>

      {!loading && recoveryRequired && !hostPreview && (
        <div className="gp-card" style={{ marginBottom: '1rem' }}>
          <strong>Open a conversation from another browser</strong>
          <p className="gp-muted">Verify the same phone you used for this conversation, using your own code in this browser. This does not give access to anyone else in your stay.</p>
          {recoveryReady && props.initialMessageId && <button type="button" className="gp-btn gp-btn-primary" disabled={recovering} onClick={() => void recoverConversation()}>
            {recovering ? 'Opening…' : 'Open this conversation here'}
          </button>}
          {recoveryReady && !props.initialMessageId && <p className="gp-muted">Open the original message link from your SMS to continue.</p>}
        </div>
      )}
      {!loading && !canSend && !hostPreview && (!recoveryRequired || !recoveryReady) && <GuestMessagingSetup slug={props.slug} onReady={() => void load()} />}
      {notice && <p role="status" className="gp-muted">{notice}</p>}
      <div aria-live="polite" className="gp-chat-panel" style={{ minHeight: 320, maxHeight: '52vh' }}>
        {loading ? (
          <p className="gp-muted"><Loader2 size={16} className="gp-spin" aria-hidden /> {t('hostLoading')}</p>
        ) : messages.length === 0 ? (
          <p className="gp-muted">{t('hostEmpty')}</p>
        ) : (
          messages.map((message) => {
            // Escalation responses render inside the card under their anchor.
            if (message.escalationId && message.role !== 'guest' && messages.some((m) => m.messageKind === 'ai_escalation' && m.escalationId === message.escalationId && m.role === 'guest')) return null;
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
                    t={t}
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
            ? t('hostReplyingEsc', { text: `${replyTo.content.slice(0, 120)}${replyTo.content.length > 120 ? '…' : ''}` })
            : t('hostReplyingTo', {
                who: replyTo.role === 'host' ? t('hostWhoHost') : t('hostWhoMessage'),
                text: `${replyTo.content.slice(0, 120)}${replyTo.content.length > 120 ? '…' : ''}`,
              })}
          <button type="button" onClick={() => setReplyTo(null)} className="gp-msg-link" style={{ marginLeft: '.6rem' }}>
            {t('cancel')}
          </button>
        </div>
      )}

      {error && <p role="alert" className="gp-alert-text">{error}</p>}

      <form
        className="gp-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="host-chat-input" className="sr-only">{t('hostTitle')}</label>
        <textarea
          id="host-chat-input"
          ref={inputRef}
          value={input}
          rows={1}
          disabled={!canSend}
          onChange={(event) => {
            setInput(event.target.value);
            growComposer();
          }}
          placeholder={t('hostPlaceholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="gp-send" disabled={busy || !input.trim() || !canSend} aria-label={t('sendMessage')} title={t('sendMessage')}>
          {busy ? <Loader2 size={18} className="gp-spin" aria-hidden /> : <ConciergeBell size={18} aria-hidden />}
        </button>
      </form>

      <p className="gp-muted" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', marginTop: '.7rem' }}>
        <ConciergeBell size={14} aria-hidden /> {t('hostNote')}
      </p>
    </section>
  );
}

// The host's response to an escalation, folded behind a down-arrow so the main
// chat stays readable. The highlighted Reply keeps the guest's answer attached
// to the escalation thread. Colors ride the portal's semantic variables so the
// card stays readable in both themes.
function EscalationResponses(props: { replies: ThreadMsg[]; open: boolean; onToggle: () => void; onReply: () => void; t: PortalT }) {
  const { t } = props;
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
          {t('hostEscReplies', { count: props.replies.length })}
        </button>
        <button
          type="button"
          onClick={props.onReply}
          style={{ border: 0, borderRadius: 999, padding: '.4rem .9rem', background: 'var(--gp-accent)', color: 'var(--gp-on-accent)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', flexShrink: 0 }}
        >
          {t('reply')}
        </button>
      </div>
      {props.open && (
        <div style={{ padding: '0 .75rem .65rem', display: 'grid', gap: '.5rem' }}>
          {props.replies.map((reply) => (
            <div key={reply.id} id={`message-${reply.id}`} tabIndex={-1} style={{ background: 'var(--gp-ghost-bg)', borderRadius: 10, padding: '.55rem .65rem', fontSize: '.9rem', lineHeight: 1.45 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}><LinkedText text={reply.content} /></div>
              <div style={{ fontSize: '.7rem', color: 'var(--gp-faint)', marginTop: '.3rem' }}>{timeLabel(reply.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
