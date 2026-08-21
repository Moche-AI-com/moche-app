'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Loader2, Megaphone, MessageSquareText, Send } from 'lucide-react';

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

export function GuestChatInbox({ propertyId, stayId, canAnnounce }: { propertyId: string; stayId: string | null; canAnnounce: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [resolveEscalation, setResolveEscalation] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcementMode, setAnnouncementMode] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const query = stayId ? `?stay=${encodeURIComponent(stayId)}` : '';
  const selectedThread = useMemo(() => threads.find((thread) => thread.id === selectedId) ?? null, [threads, selectedId]);
  const announcementStayId = stayId ?? selectedThread?.stayId ?? threads[0]?.stayId ?? null;

  const loadThreads = useCallback(async () => {
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats${query}`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not load guest chats.');
      return;
    }
    const nextThreads = Array.isArray(json.threads) ? json.threads : [];
    setThreads(nextThreads);
    setSelectedId((current) => current ?? nextThreads[0]?.id ?? null);
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

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/${selectedId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: reply.trim(), replyToMessageId: replyTo?.id, resolveEscalation }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not send the reply.');
      return;
    }
    setReply('');
    setReplyTo(null);
    setResolveEscalation(false);
    if (json.message) setMessages((current) => [...current, json.message]);
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
    void loadThreads();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: '1rem', minHeight: 640 }}>
      <aside style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,.035)' }}>
        <div style={{ padding: '.9rem', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center' }}>
          <div>
            <strong>Guests</strong>
            <div className="muted" style={{ fontSize: '.78rem' }}>Escalations and unread chats stay on top.</div>
          </div>
          {canAnnounce && (
            <button type="button" onClick={() => setAnnouncementMode((value) => !value)} style={{ borderRadius: 999, padding: '.45rem .7rem' }}>
              <Megaphone size={15} aria-hidden /> Announce
            </button>
          )}
        </div>

        {announcementMode && (
          <div style={{ padding: '.9rem', borderBottom: '1px solid rgba(255,255,255,.1)', background: 'rgba(51,230,212,.06)' }}>
            <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem' }}>
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
            <textarea value={announcement} onChange={(event) => setAnnouncement(event.target.value)} rows={3} placeholder="Announcement message…" style={{ width: '100%', marginTop: '.65rem' }} />
            <button type="button" onClick={() => void sendAnnouncement()} disabled={!announcement.trim() || (!selectAll && selectedAnnouncementIds.size === 0)} style={{ marginTop: '.5rem' }}>
              Send announcement
            </button>
          </div>
        )}

        <div role="list" aria-label="Guest conversations">
          {loadingThreads ? (
            <p className="muted" style={{ padding: '1rem' }}><Loader2 size={15} className="spin" aria-hidden /> Loading chats…</p>
          ) : threads.length === 0 ? (
            <p className="muted" style={{ padding: '1rem' }}>No guest chats yet for this stay.</p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                role="listitem"
                onClick={() => setSelectedId(thread.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  borderBottom: '1px solid rgba(255,255,255,.08)',
                  padding: '.85rem .9rem',
                  background: selectedId === thread.id ? 'rgba(51,230,212,.12)' : 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                  <strong style={{ fontWeight: thread.unreadCount > 0 || thread.pinned ? 800 : 600 }}>
                    {thread.pinned && <AlertTriangle size={13} aria-hidden style={{ marginRight: '.3rem', color: '#ffb08f' }} />}
                    {thread.guestName}
                  </strong>
                  {thread.unreadCount > 0 && <span style={{ borderRadius: 999, background: '#33E6D4', color: '#04121A', padding: '.1rem .45rem', fontSize: '.72rem', fontWeight: 800 }}>{thread.unreadCount}</span>}
                </div>
                <div className="muted" style={{ fontSize: '.76rem', marginTop: '.2rem' }}>
                  Guest ID {shortId(thread.guestId)}{thread.guestContactLast4 ? ` · ••••${thread.guestContactLast4}` : ''}
                </div>
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {thread.lastMessagePreview || 'No messages yet'}
                </div>
                <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>{timeLabel(thread.lastMessageAt)}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(255,255,255,.035)' }}>
        <div style={{ padding: '.9rem 1rem', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <strong><MessageSquareText size={16} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />{selectedThread?.guestName ?? 'Select a guest'}</strong>
          {selectedThread && (
            <div className="muted" style={{ fontSize: '.78rem', marginTop: '.2rem' }}>
              Guest ID {shortId(selectedThread.guestId)} · {selectedThread.stayStatus ?? 'stay'} · {selectedThread.unresolvedEscalationCount} unresolved escalation{selectedThread.unresolvedEscalationCount === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div aria-live="polite" style={{ flex: 1, padding: '1rem', overflowY: 'auto', maxHeight: 520 }}>
          {!selectedThread ? (
            <p className="muted">Choose a guest conversation to reply.</p>
          ) : loadingMessages ? (
            <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="muted">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const host = message.role === 'host';
              const escalation = message.messageKind === 'ai_escalation' || Boolean(message.escalationId);
              return (
                <div key={message.id} style={{ display: 'flex', justifyContent: host ? 'flex-end' : 'flex-start', marginBottom: '.7rem' }}>
                  <div style={{ maxWidth: '78%', borderRadius: host ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '.7rem .8rem', background: escalation ? 'rgba(255,138,92,.14)' : host ? 'rgba(51,230,212,.16)' : 'rgba(255,255,255,.08)', border: escalation ? '1px solid rgba(255,138,92,.4)' : '1px solid rgba(255,255,255,.1)' }}>
                    {escalation && <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', color: '#ffb08f', fontSize: '.72rem', fontWeight: 800, marginBottom: '.3rem' }}><AlertTriangle size={13} aria-hidden /> AI escalation</div>}
                    {message.messageKind === 'announcement' && <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', color: '#33E6D4', fontSize: '.72rem', fontWeight: 800, marginBottom: '.3rem' }}><Megaphone size={13} aria-hidden /> Announcement</div>}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{message.content}</div>
                    <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', marginTop: '.35rem', fontSize: '.72rem', opacity: .75 }}>
                      <span>{timeLabel(message.createdAt)}</span>
                      <button type="button" onClick={() => setReplyTo(message)} style={{ border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Reply</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {replyTo && (
          <div style={{ margin: '0 1rem .75rem', padding: '.65rem .75rem', borderRadius: 12, background: 'rgba(255,255,255,.07)', fontSize: '.84rem' }}>
            Replying to: “{replyTo.content.slice(0, 140)}{replyTo.content.length > 140 ? '…' : ''}”
            {replyTo.escalationId && (
              <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginTop: '.45rem' }}>
                <input type="checkbox" checked={resolveEscalation} onChange={(event) => setResolveEscalation(event.target.checked)} />
                Mark escalation resolved after sending
              </label>
            )}
            <button type="button" onClick={() => { setReplyTo(null); setResolveEscalation(false); }} style={{ marginLeft: '.6rem', border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Cancel</button>
          </div>
        )}

        {error && <p role="alert" style={{ color: '#ffb08f', margin: '0 1rem .75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '.55rem', padding: '.9rem 1rem', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <label htmlFor="guest-chat-reply" className="sr-only">Reply to guest</label>
          <textarea id="guest-chat-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder="Write a reply…" style={{ flex: 1, resize: 'vertical' }} />
          <button type="button" onClick={() => void sendReply()} disabled={!selectedId || !reply.trim()} aria-label="Send reply">
            <Send size={16} aria-hidden />
          </button>
        </div>

        <div className="muted" style={{ padding: '0 1rem .85rem', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
          <CheckCheck size={13} aria-hidden /> Opening a chat marks it read. Escalations stay pinned until you explicitly resolve them.
        </div>
      </section>
    </div>
  );
}
