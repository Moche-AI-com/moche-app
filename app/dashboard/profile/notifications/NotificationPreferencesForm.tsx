'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { setNotificationPreferenceAction } from './actions';
import type { NotificationChannel } from '@/lib/notifications/categories';

export interface CategoryPreference {
  key: string;
  label: string;
  description: string;
  alwaysOn: boolean;
  /** In-app master switch state. */
  enabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  /** False when this path physically never sends on that channel. */
  emailCapable: boolean;
  smsCapable: boolean;
}

type CellId = `${string}:${NotificationChannel}`;

const GRID = '1fr 3.4rem 3.4rem 3.4rem';

// Category × channel matrix. Optimistic: a switch flips immediately and snaps
// back if the server rejects the change. The server re-validates the
// category + channel pair and hard-rejects always-on paths, so a tampered
// client can never mute host messages, billing, or security alerts. Switch
// visuals reuse the um-switch classes from User management for parity.
export function NotificationPreferencesForm({
  categories,
  smsReady,
}: {
  categories: CategoryPreference[];
  /** Verified phone + SMS opt-in on file; when false, the text column gets a hint. */
  smsReady: boolean;
}) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of categories) {
      init[`${c.key}:in_app`] = c.enabled;
      init[`${c.key}:email`] = c.emailEnabled;
      init[`${c.key}:sms`] = c.smsEnabled;
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function toggle(cat: CategoryPreference, channel: NotificationChannel) {
    const id: CellId = `${cat.key}:${channel}`;
    if (cat.alwaysOn || pending[id]) return;
    if (channel === 'email' && !cat.emailCapable) return;
    if (channel === 'sms' && !cat.smsCapable) return;
    const previous = state[id] ?? (channel === 'sms' ? false : true);
    const next = !previous;
    setState((s) => ({ ...s, [id]: next }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[cat.key];
      return copy;
    });
    setPending((p) => ({ ...p, [id]: true }));
    startTransition(async () => {
      const res = await setNotificationPreferenceAction({ category: cat.key, channel, enabled: next });
      setPending((p) => ({ ...p, [id]: false }));
      if (!res?.ok) {
        setState((s) => ({ ...s, [id]: previous }));
        setErrors((e) => ({ ...e, [cat.key]: res?.error ?? 'Could not save that change. Try again.' }));
      }
    });
  }

  function renderCell(cat: CategoryPreference, channel: NotificationChannel, label: string) {
    const id: CellId = `${cat.key}:${channel}`;
    const capable = channel === 'in_app' ? true : channel === 'email' ? cat.emailCapable : cat.smsCapable;
    const on = state[id] ?? (channel === 'sms' ? false : true);
    // Capability first: a locked category that never texts must show the
    // unavailable dash, not an "on" switch that could never fire.
    if (!capable) {
      return (
        <span
          key={channel}
          className="faint"
          style={{ display: 'inline-flex', justifyContent: 'center', fontSize: '.8rem' }}
          title={`${cat.label} is never sent on this channel`}
          aria-label={`${label} not available for ${cat.label}`}
        >
          —
        </span>
      );
    }
    if (cat.alwaysOn) {
      return (
        <span key={channel} style={{ display: 'inline-flex', justifyContent: 'center' }} aria-label={`${label} always on for ${cat.label}`}>
          <span className="um-switch" data-on="true" aria-hidden style={{ opacity: 0.55 }}>
            <span className="um-switch-thumb" />
          </span>
        </span>
      );
    }
    return (
      <button
        key={channel}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${cat.label} — ${label}`}
        disabled={!!pending[id]}
        data-testid={`pref-switch-${cat.key}-${channel}`}
        onClick={() => toggle(cat, channel)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', justifyContent: 'center' }}
      >
        <span className="um-switch" data-on={on} aria-hidden>
          <span className="um-switch-thumb" />
        </span>
      </button>
    );
  }

  function renderRow(cat: CategoryPreference) {
    const isLocked = cat.alwaysOn;
    return (
      <div key={cat.key}>
        <div
          style={{ display: 'grid', gridTemplateColumns: GRID, gap: '.5rem', alignItems: 'center', padding: '.55rem 0' }}
          data-testid={isLocked ? `pref-locked-${cat.key}` : `pref-row-${cat.key}`}
        >
          <span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap', fontWeight: 600, fontSize: '.9rem' }}>
              {cat.label}
              {isLocked ? (
                <span className="badge badge-teal" style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', fontSize: '.68rem' }}>
                  <Lock size={10} aria-hidden /> Always on
                </span>
              ) : null}
            </span>
            <span className="faint" style={{ display: 'block', fontSize: '.78rem', marginTop: '.15rem' }}>
              {cat.description}
            </span>
          </span>
          {renderCell(cat, 'in_app', 'in-app notifications')}
          {renderCell(cat, 'email', 'email')}
          {renderCell(cat, 'sms', 'text message')}
        </div>
        {errors[cat.key] ? (
          <p role="alert" style={{ margin: '0 0 .5rem', fontSize: '.78rem', color: 'var(--coral)' }}>
            {errors[cat.key]}
          </p>
        ) : null}
      </div>
    );
  }

  const toggleable = categories.filter((c) => !c.alwaysOn);
  const locked = categories.filter((c) => c.alwaysOn);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '.5rem', alignItems: 'center', paddingBottom: '.35rem', borderBottom: '1px solid var(--border)' }}>
        <span className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Path</span>
        <span className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>In-app</span>
        <span className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Email</span>
        <span className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Text</span>
      </div>
      <div>{toggleable.map(renderRow)}</div>

      <p className="faint" style={{ margin: '1.25rem 0 .25rem', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        Always on
      </p>
      <div>{locked.map(renderRow)}</div>

      {!smsReady ? (
        <p className="faint" style={{ marginTop: '1rem', fontSize: '.78rem' }}>
          Text messages send only for escalations and service requests, and only with a verified
          phone and SMS alerts enabled — set that up in{' '}
          <Link href="/dashboard/profile/security">Security and sign-in</Link>.
        </p>
      ) : null}
    </div>
  );
}
