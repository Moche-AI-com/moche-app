'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, CheckCheck, MessageCircle, Gauge, Info } from 'lucide-react';
import { markNotificationReadAction, markAllNotificationsReadAction } from '@/app/dashboard/notifications/actions';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, typeof MessageCircle> = {
  escalation: MessageCircle,
  service_request: Gauge,
  system: Info,
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Compact, actionable notification bell: shows the 6 most recent notifications
// inline, lets a host clear one or all with a single click, and only falls back
// to the full /dashboard/notifications page for history beyond that. Replaces
// the old "badge that just links to a flat list" pattern.
export function NotificationBell({ unread: initialUnread, items: initialItems }: { unread: number; items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Re-sync from the server after revalidatePath pushes fresh props, otherwise
  // local state would keep serving a stale snapshot for the rest of the session.
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  useEffect(() => { setUnread(initialUnread); }, [initialUnread]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function handleItemClick(item: NotificationItem) {
    if (!item.read_at) {
      // Optimistic update, rolled back if the server rejects it so the UI never
      // claims a notification was read when it wasn't.
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
      startTransition(() => {
        void markNotificationReadAction(item.id).then((res) => {
          if (!res?.ok) {
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: null } : n)));
            setUnread((u) => u + 1);
          }
        });
      });
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  function handleMarkAllRead() {
    const prevItems = items;
    const prevUnread = unread;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    startTransition(() => {
      void markAllNotificationsReadAction().then((res) => {
        if (!res?.ok) {
          setItems(prevItems);
          setUnread(prevUnread);
        }
      });
    });
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="badge"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Notifications"
        data-testid="button-notification-bell"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', border: 'none', cursor: 'pointer', background: 'var(--surface-2)' }}
      >
        <Bell size={14} aria-hidden /> {unread > 0 ? <strong style={{ color: 'var(--coral)' }}>{unread}</strong> : '0'}
      </button>

      {open && (
        <div
          className="card"
          data-testid="notification-dropdown"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 340,
            maxWidth: 'calc(100vw - 2rem)',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,.28)',
            zIndex: 60,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: '.9rem' }}>Notifications</strong>
            {unread > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleMarkAllRead}
                data-testid="button-mark-all-read"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.78rem' }}
              >
                <CheckCheck size={13} aria-hidden /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '.85rem' }}>You&rsquo;re all caught up.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {items.slice(0, 6).map((item) => {
                const Icon = KIND_ICON[item.kind] ?? Info;
                const isUnread = !item.read_at;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    data-testid={`notification-item-${item.id}`}
                    style={{
                      display: 'flex',
                      gap: '.65rem',
                      alignItems: 'flex-start',
                      width: '100%',
                      textAlign: 'left',
                      padding: '.75rem 1rem',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      // Unread rows need a tint that reads against the .card surface
                      // (--surface-2 is the card background, so it was invisible) plus
                      // a teal rail matching the /dashboard/notifications page.
                      borderLeft: isUnread ? '3px solid var(--teal)' : '3px solid transparent',
                      background: isUnread ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flexShrink: 0, marginTop: 2, color: isUnread ? 'var(--teal)' : 'var(--text-muted)' }}>
                      <Icon size={15} aria-hidden />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '.85rem', fontWeight: isUnread ? 600 : 500 }}>{item.title}</span>
                      {item.body && (
                        <span
                          className="muted"
                          style={{
                            fontSize: '.78rem',
                            marginTop: '.15rem',
                            // Clamp to 2 whole lines instead of a single nowrap line —
                            // nowrap+ellipsis cut words mid-token ("doo…", "cod…").
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.body}
                        </span>
                      )}
                      <span className="faint" style={{ display: 'block', fontSize: '.7rem', marginTop: '.25rem' }}>{timeAgo(item.created_at)}</span>
                    </span>
                    {isUnread && <Check size={13} aria-hidden style={{ flexShrink: 0, marginTop: 3, color: 'var(--teal)', opacity: 0.5 }} />}
                  </button>
                );
              })}
            </div>
          )}

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            style={{ display: 'block', textAlign: 'center', padding: '.7rem 1rem', fontSize: '.82rem', fontWeight: 600, color: 'var(--teal)', borderTop: '1px solid var(--border)' }}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
