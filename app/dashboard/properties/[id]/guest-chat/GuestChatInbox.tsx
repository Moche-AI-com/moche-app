'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCheck,
  ChevronDown,
  Loader2,
  Megaphone,
  MessageSquareText,
  PanelRightClose,
  Send,
  UserRound,
} from 'lucide-react';

type Thread = {
  id: string;
  stayId: string;
  guestId: string | null;
  guestName: string;
  guestContactLast4: string | null;
  stayStatus: string | null;
  checkIn: string | null;
  checkOut: string | null;
  channel: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  unresolvedEscalationCount: number;
  pinned: boolean;
  registered: boolean;
};

type ChatMessage = {
  id: string;
  role: 'guest' | 'host' | 'system' | 'assistant';
  content: string;
  createdAt: string;
  messageKind: string;
  replyToMessageId: string | null;
  escalationId: string | null;
};

function shortId(id: string | null) {
  return id ? id.replace(/-/g, '').slice(0, 6).toUpperCase() : 'GUEST';
}

function timeLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'G';
}

export function GuestChatInbox({ propertyId, stayId, canAnnounce, canLearn }: { propertyId: string; stayId: string | null; canAnnounce: boolean; canLearn: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [resolveEscalation, setResolveEscalation] = useState(false);
  const [learnFromReply, setLearnFromReply] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcementMode, setAnnouncementMode] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const query = stayId ? `?stay=${encodeURIComponent(stayId)}` : '';
  const selectedThread = useMemo(() => threads.find((thread) => thread.id === selectedId) ?? null, [threads, selectedId]);
  const announcementStayId = stayId ?? selectedThread?.stayId ?? threads[0]?.stayId ?? null;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const totalPinned = threads.filter((thread) => thread.pinned).length;

  const loadThreads = useCallback(async () => {
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats${query}`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not load guest chats.');
      return;
    }
    const nextThreads = Array.isArray(json.threads) ? json.threads : [];
    setThreads(nextThreads);
    setLoadingThreads(false);
  }, [propertyId, query]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/${conversationId}/messages`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setError(null);
    } else {
      setError(json.error || 'Could not load messages.');
    }
    setLoadingMessages(false);
  }, [propertyId]);

  useEffect(() => {
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(), 8000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId), 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function openThread(threadId: string) {
    setReplyTo(null);
    setResolveEscalation(false);
    setLearnFromReply(false);
    setNotice(null);
    if (selectedId === threadId) {
      setSelectedId(null);
      setMessages([]);
      return;
    }
    setSelectedId(threadId);
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setNotice(null);
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/${selectedId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: reply.trim(),
        replyToMessageId: replyTo?.id,
        resolveEscalation,
        learnFromReply: replyTo?.escalationId ? learnFromReply : false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not send the reply.');
      return;
    }
    setReply('');
    setReplyTo(null);
    setResolveEscalation(false);
    setLearnFromReply(false);
    if (json.message) setMessages((current) => [...current, json.message]);
    if (json.learningQueued) setNotice('Reply sent. A normalized Brain update is waiting in the approval queue.');
    if (json.learningError) setNotice(`Reply sent, but the Brain update could not be queued: ${json.learningError}`);
    void loadThreads();
  }

  async function sendAnnouncement() {
    if (!announcementStayId || !announcement.trim()) return;
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/announcements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stayId: announcementStayId,
        message: announcement.trim(),
        selectAll,
        conversationIds: selectAll ? [] : [...selectedAnnouncementIds],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not send the announcement.');
      return;
    }
    setAnnouncement('');
    setSelectedAnnouncementIds(new Set());
    setSelectAll(false);
    setAnnouncementMode(false);
    setNotice(`Announcement sent to ${json.sent ?? 0} guest chat${json.sent === 1 ? '' : 's'}.`);
    void loadThreads();
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="dash-metrics-grid">
        <div className="card stat-card">
          <div className="dash-metric-top">
            <span className="dash-metric-label">Open threads</span>
            <span className="stat-icon"><MessageSquareText size={15} aria-hidden /></span>
          </div>
          <strong className="dash-metric-value" style={{ fontSize: '1.4rem' }}>{threads.length}</strong>
        </div>
        <div className="card stat-card">
          <div className="dash-metric-top">
            <span className="dash-metric-label">Unread messages</span>
            <span className="stat-icon"><CheckCheck size={15} aria-hidden /></span>
          </div>
          <strong className="dash-metric-value" style={{ fontSize: '1.4rem' }}>{totalUnread}</strong>
        </div>
        <div className={`card stat-card${totalPinned > 0 ? ' stat-attn' : ''}`}>
          <div className="dash-metric-top">
            <span className="dash-metric-label">Pinned escalations</span>
            <span className="stat-icon"><AlertTriangle size={15} aria-hidden /></span>
          </div>
          <strong className="dash-metric-value" style={{ fontSize: '1.4rem' }}>{totalPinned}</strong>
        </div>
      </div>

      <div className={`chat-shell${selectedThread ? ' has-thread' : ''}`}>
        <aside className="chat-panel">
          <div className="chat-panel-head">
            <div>
              <strong>Guest threads</strong>
              <div className="muted" style={{ fontSize: '.78rem' }}>Open a thread to reply. Click it again to collapse.</div>
            </div>
            {canAnnounce && (
              <button type="button" className="btn-secondary" onClick={() => setAnnouncementMode((value) => !value)}>
                <Megaphone size={15} aria-hidden /> Announce
              </button>
            )}
          </div>

          {announcementMode && (
            <div className="chat-announce">
              <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem', fontWeight: 650 }}>
                <input type="checkbox" checked={selectAll} onChange={(event) => setSelectAll(event.target.checked)} />
                Select All Guests
              </label>
              {!selectAll && threads.map((thread) => (
                <label key={thread.id} style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem', marginTop: '.45rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedAnnouncementIds.has(thread.id)}
                    onChange={(event) => {
                      setSelectedAnnouncementIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(thread.id); else next.delete(thread.id);
                        return next;
                      });
                    }}
                  />
                  {thread.guestName}
                </label>
              ))}
              <textarea className="textarea" value={announcement} onChange={(event) => setAnnouncement(event.target.value)} rows={3} placeholder="Announcement message…" style={{ marginTop: '.65rem' }} />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void sendAnnouncement()} disabled={!announcement.trim() || (!selectAll && selectedAnnouncementIds.size === 0)} style={{ marginTop: '.5rem' }}>
                Send announcement
              </button>
            </div>
          )}

          <div role="list" aria-label="Guest conversations" className="chat-thread-list">
            {loadingThreads ? (
              <p className="muted" style={{ padding: '.5rem' }}><Loader2 size={15} className="spin" aria-hidden /> Loading chats…</p>
            ) : threads.length === 0 ? (
              <p className="muted" style={{ padding: '.5rem' }}>No guest chats yet for this stay.</p>
            ) : (
              threads.map((thread) => {
                const active = selectedId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread.id)}
                    aria-pressed={active}
                    className={`chat-thread-item${active ? ' is-active' : ''}`}
                  >
                    <div style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start' }}>
                      <span className="chat-thread-avatar">{initials(thread.guestName)}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                          <strong style={{ fontWeight: thread.unreadCount > 0 || thread.pinned ? 800 : 650 }}>{thread.guestName}</strong>
                          <ChevronDown size={15} aria-hidden style={{ transform: active ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
                        </span>
                        <span className="muted" style={{ display: 'block', fontSize: '.76rem', marginTop: '.15rem' }}>
                          Guest ID {shortId(thread.guestId)}{thread.guestContactLast4 ? ` · ••••${thread.guestContactLast4}` : ''}
                        </span>
                        <span className="muted" style={{ display: 'block', fontSize: '.78rem', marginTop: '.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {thread.lastMessagePreview || 'No messages yet'}
                        </span>
                        <span style={{ display: 'flex', gap: '.35rem', alignItems: 'center', marginTop: '.55rem', flexWrap: 'wrap' }}>
                          {thread.pinned && <span className="badge badge-coral"><AlertTriangle size={11} aria-hidden /> Escalation</span>}
                          {thread.unreadCount > 0 && <span className="badge badge-teal">{thread.unreadCount} unread</span>}
                          <span className="muted" style={{ fontSize: '.72rem' }}>{timeLabel(thread.lastMessageAt)}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {selectedThread ? (
          <section className="chat-panel">
            <div className="chat-panel-head">
              <div>
                <strong><MessageSquareText size={16} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />{selectedThread.guestName}</strong>
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.2rem' }}>
                  Guest ID {shortId(selectedThread.guestId)} · {selectedThread.stayStatus ?? 'stay'} · {selectedThread.unresolvedEscalationCount} unresolved escalation{selectedThread.unresolvedEscalationCount === 1 ? '' : 's'}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => { setSelectedId(null); setMessages([]); }} aria-label="Collapse thread">
                <PanelRightClose size={15} aria-hidden /> Collapse
              </button>
            </div>

            {selectedThread.unresolvedEscalationCount > 0 && (
              <div className="chat-banner-escalation" role="status">
                <AlertTriangle size={14} aria-hidden />
                {selectedThread.unresolvedEscalationCount} unresolved escalation{selectedThread.unresolvedEscalationCount === 1 ? '' : 's'} in this thread — reply to an escalated message and toggle “Resolve on send”.
              </div>
            )}

            <div aria-live="polite" className="chat-messages">
              {loadingMessages ? (
                <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="muted">No messages yet.</p>
              ) : (
                messages.map((message) => {
                  const host = message.role === 'host';
                  const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
                  return (
                    <div key={message.id} className={`bubble-row${host ? ' bubble-row-host' : ''}`}>
                      <div className={`bubble${host ? ' bubble-host' : ' bubble-guest'}${escalation ? ' bubble-escalation' : ''}`}>
                        {escalation && <div className="bubble-flag bubble-flag-escalation"><AlertTriangle size={13} aria-hidden /> AI escalation</div>}
                        {message.messageKind === 'announcement' && <div className="bubble-flag bubble-flag-announcement"><Megaphone size={13} aria-hidden /> Announcement</div>}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                        <div className="bubble-meta">
                          <span>{timeLabel(message.createdAt)}</span>
                          <button type="button" className="bubble-reply" onClick={() => setReplyTo(message)}>Reply</button>
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
                  Replying to: “{replyTo.content.slice(0, 140)}{replyTo.content.length > 140 ? '…' : ''}”
                </div>
                <button type="button" className="bubble-reply" onClick={() => { setReplyTo(null); setResolveEscalation(false); setLearnFromReply(false); }} style={{ marginTop: '.55rem' }}>
                  Cancel reply
                </button>
              </div>
            )}

            {replyTo?.escalationId && (
              <div className="chip-row">
                <button
                  type="button"
                  className={`chip-toggle chip-coral${resolveEscalation ? ' is-on' : ''}`}
                  aria-pressed={resolveEscalation}
                  onClick={() => setResolveEscalation((value) => !value)}
                >
                  <CheckCheck size={13} aria-hidden /> Resolve on send
                </button>
                {canLearn && (
                  <button
                    type="button"
                    className={`chip-toggle${learnFromReply ? ' is-on' : ''}`}
                    aria-pressed={learnFromReply}
                    title="A top model normalizes the question, your reply, and attached thread messages into a pending Q/A proposal for human approval."
                    onClick={() => setLearnFromReply((value) => !value)}
                  >
                    <Brain size={13} aria-hidden /> Improve the Brain
                  </button>
                )}
              </div>
            )}

            {notice && <p role="status" style={{ color: 'var(--teal)', margin: '0 1rem .75rem' }}>{notice}</p>}
            {error && <p role="alert" style={{ color: 'var(--coral)', margin: '0 1rem .75rem' }}>{error}</p>}

            <div className="chat-composer">
              <label htmlFor="guest-chat-reply" className="sr-only">Reply to guest</label>
              <textarea id="guest-chat-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder="Write a clear, guest-ready reply…" />
              <button type="button" className="chat-composer-send" onClick={() => void sendReply()} disabled={!selectedId || !reply.trim()} aria-label="Send reply">
                <Send size={16} aria-hidden />
              </button>
            </div>

            <div className="muted" style={{ padding: '0 1rem .9rem', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
              <CheckCheck size={13} aria-hidden /> Opening a chat marks it read. Escalations stay pinned until you explicitly resolve them.
            </div>
          </section>
        ) : (
          <section className="chat-empty">
            <UserRound size={28} aria-hidden style={{ color: 'var(--text-muted)' }} />
            <h2 style={{ margin: '.7rem 0 .3rem' }}>Select a guest thread</h2>
            <p className="muted" style={{ margin: 0 }}>Open a conversation on the left to reply, resolve escalations, or propose a Brain update.</p>
          </section>
        )}
      </div>
    </div>
  );
}
