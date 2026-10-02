'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, X } from 'lucide-react';
import type { TextAlertGap } from '@/lib/notifications/host-reachability';

const SNOOZE_KEY = 'moche:text-alerts-banner-snoozed-at';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// #195 launch: a host is only texted when a guest needs them (including
// emergencies) after verifying a phone AND opting in. Shown until they do;
// "Remind me later" hides it for 7 days on this device.
export function TextAlertsBanner({ reason }: { reason: TextAlertGap }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const at = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      setHidden(Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS);
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const detail = reason === 'not_opted_in'
    ? 'Your phone is verified, but text alerts are off. Turn them on to hear about waiting guests and emergencies right away.'
    : 'Add and verify your phone to get a text when a guest needs you, including emergencies.';

  return (
    <div
      role="status"
      data-testid="text-alerts-banner"
      style={{
        display: 'flex', gap: '.75rem', alignItems: 'flex-start', padding: '.8rem 1rem', marginBottom: '1.25rem',
        borderRadius: 12, border: '1px solid var(--border, rgba(0,0,0,.12))', background: 'var(--surface-2, rgba(0,0,0,.04))',
      }}
    >
      <BellRing size={18} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, fontSize: '.9rem', lineHeight: 1.45 }}>
        <strong>You won&apos;t get texts when guests need you.</strong> {detail}{' '}
        <Link href="/dashboard/profile/security" data-testid="link-enable-text-alerts">Set up text alerts</Link>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="Remind me later"
        title="Remind me later"
        onClick={() => {
          try {
            window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
          } catch {
            // Storage unavailable: hide for this page view only.
          }
          setHidden(true);
        }}
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
