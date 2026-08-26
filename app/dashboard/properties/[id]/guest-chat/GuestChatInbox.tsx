'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  Loader2,
  Megaphone,
  MessageSquareText,
  Sparkles,
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
  extrasCount: number;
  pinned: boolean;
  registered: boolean;
};

type Filter = 'all' | 'unread' | 'escalations' | 'extras';

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

// Conversation list for the merged Stays tab. Threads open as their own full
// page (stays/[stayId]/conversations/[conversationId]) — there is deliberately
// no inline popout, which removes the squeezed/cut-off thread pane entirely.
export function GuestChatInbox({ propertyId, stayId, canAnnounce }: { propertyId: string; stayId: string | null; canAnnounce: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcementMode, setAnnouncementMode] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const query = stayId ? `?stay=${encodeURIComponent(stayId)}` : '';
  const announcementStayId = stayId ?? threads[0]?.stayId ?? null;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const totalPinned = threads.filter((thread) => thread.pinned).length;
  const totalExtras = threads.reduce((sum, thread) => sum + thread.extrasCount, 0);
  const visibleThreads = useMemo(
    () => threads.filter((thread) => {
      if (filter === 'unread') return thread.unreadCount > 0;
      if (filter === 'escalations') return thread.pinned;
      if (filter === 'extras') return thread.extrasCount > 0;
      return true;
    }),
    [threads, filter],
  );

  const loadThreads = useCallback(async () => {
    const res = await fetch(`/api/host/properties/${propertyId}/guest-chats${query}`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not load guest chats.');
      return;
    }
    setThreads(Array.isArray(json.threads) ? json.threads : []);
    setLoadingThreads(false);
  }, [propertyId, query]);

  useEffect(() => {
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(), 8000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

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
        <button
          type="button"
          className={`card stat-card${totalExtras > 0 ? ' stat-attn' : ''}`}
          onClick={() => setFilter('extras')}
          data-testid="card-filter-extras"
          style={{ textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="dash-metric-top">
            <span className="dash-metric-label">Extras requested</span>
            <span className="stat-icon"><Sparkles size={15} aria-hidden /></span>
          </div>
          <strong className="dash-metric-value" style={{ fontSize: '1.4rem' }}>{totalExtras}</strong>
        </button>
      </div>

      <div className="chat-panel">
        <div className="chat-panel-head">
          <div>
            <strong>Guest threads</strong>
            <div className="muted" style={{ fontSize: '.78rem' }}>Open a thread to reply on its own page.</div>
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

        <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', padding: '.85rem var(--pad-card) 0' }}>
          <button type="button" className={`chip-toggle${filter === 'all' ? ' is-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')} data-testid="filter-all">
            <MessageSquareText size={13} aria-hidden /> Open threads ({threads.length})
          </button>
          <button type="button" className={`chip-toggle${filter === 'unread' ? ' is-on' : ''}`} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')} data-testid="filter-unread">
            <CheckCheck size={13} aria-hidden /> Unread ({totalUnread})
          </button>
          <button type="button" className={`chip-toggle chip-coral${filter === 'escalations' ? ' is-on' : ''}`} aria-pressed={filter === 'escalations'} onClick={() => setFilter('escalations')} data-testid="filter-escalations">
            <AlertTriangle size={13} aria-hidden /> Escalations ({totalPinned})
          </button>
          <button type="button" className={`chip-toggle${filter === 'extras' ? ' is-on' : ''}`} aria-pressed={filter === 'extras'} onClick={() => setFilter('extras')} data-testid="filter-extras">
            <Sparkles size={13} aria-hidden /> Extras ({totalExtras})
          </button>
        </div>

        {notice && <p role="status" style={{ color: 'var(--teal)', margin: '.6rem 1rem 0' }}>{notice}</p>}
        {error && <p role="alert" style={{ color: 'var(--coral)', margin: '.6rem 1rem 0' }}>{error}</p>}

        <div role="list" aria-label="Guest conversations" className="chat-thread-list">
          {loadingThreads ? (
            <p className="muted" style={{ padding: '.5rem' }}><Loader2 size={15} className="spin" aria-hidden /> Loading chats…</p>
          ) : visibleThreads.length === 0 ? (
            <p className="muted" style={{ padding: '.5rem' }}>
              {filter === 'all'
                ? 'No guest chats yet for this stay.'
                : filter === 'unread'
                  ? 'Nothing unread.'
                  : filter === 'extras'
                    ? 'No active Extras requests.'
                    : 'No open escalations.'}
            </p>
          ) : (
            visibleThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/dashboard/properties/${propertyId}/stays/${thread.stayId}/conversations/${thread.id}`}
                className="chat-thread-item"
                style={{ display: 'block', textDecoration: 'none' }}
                data-testid={`thread-link-${thread.id}`}
              >
                <div style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start' }}>
                  <span className="chat-thread-avatar">{initials(thread.guestName)}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}>
                      <strong style={{ fontWeight: thread.unreadCount > 0 || thread.pinned || thread.extrasCount > 0 ? 800 : 650 }}>{thread.guestName}</strong>
                      <ChevronRight size={15} aria-hidden className="muted" />
                    </span>
                    <span className="muted" style={{ display: 'block', fontSize: '.76rem', marginTop: '.15rem' }}>
                      Guest ID {shortId(thread.guestId)}{thread.guestContactLast4 ? ` · ••••${thread.guestContactLast4}` : ''}
                    </span>
                    <span className="muted" style={{ display: 'block', fontSize: '.78rem', marginTop: '.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {thread.lastMessagePreview || 'No messages yet'}
                    </span>
                    <span style={{ display: 'flex', gap: '.35rem', alignItems: 'center', marginTop: '.55rem', flexWrap: 'wrap' }}>
                      {thread.pinned && <span className="badge badge-coral"><AlertTriangle size={11} aria-hidden /> Escalation</span>}
                      {thread.extrasCount > 0 && <span className="badge badge-teal"><Sparkles size={11} aria-hidden /> Extras ({thread.extrasCount})</span>}
                      {thread.unreadCount > 0 && <span className="badge badge-teal">{thread.unreadCount} unread</span>}
                      <span className="muted" style={{ fontSize: '.72rem' }}>{timeLabel(thread.lastMessageAt)}</span>
                    </span>
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
