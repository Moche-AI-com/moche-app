'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';

type InviteRow = {
  id: string;
  created_at: string;
  expires_at: string | null;
  max_redemptions: number;
  redemption_count: number;
  consumed_at: string | null;
  revoked_at: string | null;
};
type PanelData = {
  invites: InviteRow[];
  settings: { enabled: boolean; maxJoins: number };
  guestCount: number;
  canManageSettings: boolean;
};
type Status = 'none' | 'active' | 'full' | 'expired' | 'revoked';

const STATUS_LABEL: Record<Status, string> = {
  none: 'No link yet',
  active: 'Active',
  full: 'Full',
  expired: 'Expired',
  revoked: 'Revoked',
};

function statusOf(row: InviteRow | undefined, now: number): Status {
  if (!row) return 'none';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  if (row.consumed_at || row.redemption_count >= row.max_redemptions) return 'full';
  return 'active';
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// Host controls for guest 'Invite your group' links on one stay: status, add
// spots, revoke, and the property-wide on/off + default spots. Revoking stops
// new joins only; guests already in the stay keep access.
export function PartyInvitePanel({ propertyId, stayId }: { propertyId: string; stayId: string }) {
  const base = `/api/host/properties/${encodeURIComponent(propertyId)}`;
  const linkUrl = `${base}/stays/${encodeURIComponent(stayId)}/party-invite`;
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [spots, setSpots] = useState(10);
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [maxJoinsDraft, setMaxJoinsDraft] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(linkUrl, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || 'Could not load the group invite.'); return; }
      const next = json as PanelData;
      setData(next);
      setEnabledDraft(next.settings.enabled);
      setMaxJoinsDraft(next.settings.maxJoins);
      if (next.invites[0]) setSpots(next.invites[0].max_redemptions);
      setError(null);
    } catch {
      setError('Could not load the group invite.');
    } finally {
      setLoading(false);
    }
  }, [linkUrl]);

  useEffect(() => { void load(); }, [load]);

  async function send(url: string, method: 'PATCH' | 'DELETE', body?: unknown): Promise<boolean> {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || 'That did not save. Please try again.'); return false; }
      return true;
    } catch {
      setError('That did not save. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (await send(linkUrl, 'DELETE')) {
      setConfirmRevoke(false);
      setNotice('Link revoked. No one new can join with it; guests already in the stay keep access.');
      await load();
    }
  }

  async function saveSpots() {
    if (await send(linkUrl, 'PATCH', { maxRedemptions: spots })) {
      setNotice('Spots updated.');
      await load();
    }
  }

  async function saveSettings() {
    if (await send(`${base}/party-invite-settings`, 'PATCH', { enabled: enabledDraft, maxJoins: maxJoinsDraft })) {
      setNotice('Invite settings saved.');
      await load();
    }
  }

  if (!data) {
    return (
      <section className="card-2" style={{ padding: '.75rem', marginTop: '.8rem' }} data-testid="party-invite-panel">
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading group invite…</p>
        ) : (
          <p role="alert" style={{ color: 'var(--coral)' }}>{error ?? 'Could not load the group invite.'}</p>
        )}
      </section>
    );
  }

  const latest = data.invites[0];
  const status = statusOf(latest, Date.now());
  const live = status === 'active' || status === 'full';
  const used = latest?.redemption_count ?? 0;
  const defaultCap = Math.max(data.settings.maxJoins, data.guestCount);

  return (
    <section className="card-2" style={{ padding: '.75rem', marginTop: '.8rem' }} data-testid="party-invite-panel" aria-label="Group invite link">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
          <Link2 size={15} aria-hidden /> Group invite link
        </strong>
        <span className="muted" style={{ fontSize: '.78rem' }} data-testid="party-invite-status">{STATUS_LABEL[status]}</span>
      </div>

      {!data.settings.enabled && (
        <p className="muted" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>
          Guest invites are off for this property. Guests won’t see “Invite your group”.
        </p>
      )}

      <p className="faint" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>
        {status === 'none' && `No invite link yet. A guest creates one by tapping “Invite your group” in their portal. It will allow up to ${defaultCap} people.`}
        {status === 'active' && latest && `${used} of ${latest.max_redemptions} joined · expires ${when(latest.expires_at)}`}
        {status === 'full' && latest && `${used} of ${latest.max_redemptions} joined. Anyone else who opens the link is told it’s full — add spots to let more people in.`}
        {status === 'expired' && 'This link expired after checkout.'}
        {status === 'revoked' && latest && `Revoked ${when(latest.revoked_at)}. ${data.settings.enabled ? 'A guest can create a fresh link from their portal.' : 'Turn invites back on to let guests create a new link.'}`}
      </p>

      {live && latest && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.65rem' }}>
          <label htmlFor={`party-spots-${stayId}`} className="faint" style={{ fontSize: '.8rem' }}>Spots on this link</label>
          <input
            id={`party-spots-${stayId}`}
            type="number"
            min={Math.max(1, used)}
            max={30}
            value={spots}
            onChange={(e) => setSpots(Number(e.target.value))}
            className="input"
            style={{ width: 80 }}
            data-testid="input-party-spots"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={saveSpots} disabled={busy || spots === latest.max_redemptions} data-testid="button-party-spots-save">
            {status === 'full' ? 'Add spots' : 'Update spots'}
          </button>
          {!confirmRevoke ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRevoke(true)} disabled={busy} data-testid="button-party-revoke">
              Revoke link
            </button>
          ) : (
            <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="faint" style={{ fontSize: '.8rem' }}>No one new can join with this link. Guests already in keep access.</span>
              <button type="button" className="btn btn-sm" onClick={revoke} disabled={busy} data-testid="button-party-revoke-confirm" style={{ color: 'var(--coral)' }}>
                Revoke
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRevoke(false)} disabled={busy}>Cancel</button>
            </span>
          )}
        </div>
      )}

      {data.canManageSettings && (
        <div style={{ borderTop: '1px solid var(--border, rgba(0,0,0,.08))', marginTop: '.75rem', paddingTop: '.65rem', display: 'grid', gap: '.45rem' }}>
          <span className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Property setting</span>
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem' }}>
            <input type="checkbox" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} data-testid="toggle-party-enabled" />
            Let guests invite their group
          </label>
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem', flexWrap: 'wrap' }}>
            Default spots per link
            <input
              type="number"
              min={1}
              max={30}
              value={maxJoinsDraft}
              onChange={(e) => setMaxJoinsDraft(Number(e.target.value))}
              className="input"
              style={{ width: 80 }}
              data-testid="input-party-default-spots"
            />
          </label>
          <span className="faint" style={{ fontSize: '.75rem' }}>Applies to new links. If the booking has more guests, that number is used instead.</span>
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={saveSettings}
              disabled={busy || (enabledDraft === data.settings.enabled && maxJoinsDraft === data.settings.maxJoins)}
              data-testid="button-party-settings-save"
            >
              Save setting
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: 'var(--coral)', fontSize: '.82rem', marginTop: '.5rem' }}>{error}</p>}
      {notice && <p role="status" className="faint" style={{ fontSize: '.82rem', marginTop: '.5rem' }}>{notice}</p>}
    </section>
  );
}
