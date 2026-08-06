'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, CheckCheck, MessageCircle, Gauge, Info } from 'lucide-react';
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
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const router = useRouter();

  // Re-sync from the server after revalidatePath pushes fresh props, otherwise
  // local state would keep serving a stale snapshot for the rest of the session.
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  useEffect(() => { setUnread(initialUnread); }, [initialUnread]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')
          ?.focus();
      });
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      requestAnimationFrame(() => bellRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
    <div ref={rootRef} className="notification-bell-root">
      <button
        ref={bellRef}
        type="button"
        className="badge"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="notification-disclosure"
        aria-haspopup="dialog"
        title="Notifications"
        data-testid="button-notification-bell"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', border: 'none', cursor: 'pointer', background: 'var(--surface-2)' }}
      >
        <Bell size={14} aria-hidden />
        <strong aria-hidden="true" style={{ color: unread > 0 ? 'var(--coral)' : undefined }}>{unread}</strong>
        <span className="sr-only" aria-live="polite">{unread} unread notification{unread === 1 ? '' : 's'}</span>
      </button>

      {open && (
        <>
          <button type="button" className="notification-backdrop" onClick={() => setOpen(false)} aria-label="Close notifications" tabIndex={-1} />
          <div
            ref={panelRef}
            id="notification-disclosure"
            className="card notification-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            data-testid="notification-dropdown"
          >
          <div className="notification-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: '.9rem' }}>Notifications</strong>
            {unread > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleMarkAllRead}
                data-testid="button-mark-all-read"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.78rem' }}
              >
                <CheckCheck size={13} aria-hidden /> Mark all read
              </button>
            ) : (
              // Say so explicitly. An empty header next to already-read rows reads
              // as a missing button rather than as "nothing to do".
              <span
                className="faint"
                data-testid="notifications-all-read"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.76rem' }}
              >
                <CheckCheck size={13} aria-hidden /> All caught up
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '.85rem' }}>You&rsquo;re all caught up.</p>
            </div>
          ) : (
            <div className="notification-list">
              {items.slice(0, 6).map((item) => {
                const Icon = KIND_ICON[item.kind] ?? Info;
                const isUnread = !item.read_at;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    data-testid={`notification-item-${item.id}`}
                    className="notification-row"
                    style={{
                      // Unread rows need a tint that reads against the .card surface
                      // (--surface-2 is the card background, so it was invisible) plus
                      // a teal rail matching the /dashboard/notifications page.
                      borderLeft: isUnread ? '3px solid var(--teal)' : '3px solid transparent',
                      background: isUnread ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent',
                    }}
                  >
                    <span className="notification-row-icon" style={{ color: isUnread ? 'var(--teal)' : 'var(--text-muted)' }}>
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="notification-row-text">
                      <span className="notification-row-title" style={{ fontWeight: isUnread ? 600 : 500 }}>{item.title}</span>
                      {item.body && (
                        <span
                          className="muted notification-row-body"
                        >
                          {item.body}
                        </span>
                      )}
                    </span>
                    <span className="faint notification-row-time">{timeAgo(item.created_at)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="notification-panel-footer"
          >
            View all notifications
          </Link>
          </div>
        </>
      )}
    </div>
  );
}
