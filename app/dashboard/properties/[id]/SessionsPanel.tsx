'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ipHint: string;
  verifiedAt: string | null;
  expiresAt: string;
  status: string;
  guestDisplayName: string | null;
}

// Short device label from a user-agent string (best-effort, no library).
function device(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const s = ua.toLowerCase();
  const os = /iphone|ipad|ios/.test(s) ? 'iOS' : /android/.test(s) ? 'Android' : /mac os x|macintosh/.test(s) ? 'macOS' : /windows/.test(s) ? 'Windows' : /linux/.test(s) ? 'Linux' : 'Device';
  const browser = /edg\//.test(s) ? 'Edge' : /chrome|crios/.test(s) ? 'Chrome' : /firefox|fxios/.test(s) ? 'Firefox' : /safari/.test(s) ? 'Safari' : '';
  return browser ? `${browser} · ${os}` : os;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SessionsPanel({ propertyId, initialSessions }: { propertyId: string; initialSessions: SessionRow[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function revoke(sessionId: string) {
    setBusyId(sessionId);
    setErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/sessions/${sessionId}/revoke`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not revoke.');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not revoke.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '.6rem' }}>Active guest sessions</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
        Devices with a live session. Revoke instantly if a guest checks out early or a device is lost.
      </p>
      {err && <div className="alert alert-error" style={{ fontSize: '.82rem', marginBottom: '.6rem' }}>{err}</div>}
      {sessions.length === 0 ? (
        <p className="faint" style={{ fontSize: '.82rem' }}>No active guest sessions.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {sessions.map((s) => (
            <div key={s.id} className="card-2" style={{ padding: '.7rem .9rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }} data-testid={`session-${s.id}`}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>
                  {s.guestDisplayName ?? 'Guest'} <span className="faint" style={{ fontWeight: 400 }}>· {device(s.userAgent)}</span>
                </div>
                <div className="faint" style={{ fontSize: '.75rem', marginTop: '.2rem' }}>
                  IP {s.ipHint} · verified {fmt(s.verifiedAt)} · expires {fmt(s.expiresAt)}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--coral)' }}
                disabled={busyId === s.id}
                onClick={() => revoke(s.id)}
                data-testid={`button-revoke-session-${s.id}`}
              >
                {busyId === s.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
