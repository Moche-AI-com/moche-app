'use client';

import { useState, useTransition } from 'react';
import { setEmailDigestAction } from './actions';

// The member's global digest switch. When on, digest-eligible categories
// (extras, review nudges, property knowledge) bundle into one morning email
// instead of instant sends; urgent paths always arrive instantly.
export function DigestSwitch({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  function toggle() {
    if (pending) return;
    const previous = enabled;
    const next = !previous;
    setEnabled(next);
    setError(null);
    setPending(true);
    startTransition(async () => {
      const res = await setEmailDigestAction(next);
      setPending(false);
      if (!res?.ok) {
        setEnabled(previous);
        setError(res?.error ?? 'Could not save that change. Try again.');
      }
    });
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        className={`um-switch-row${enabled ? ' is-on' : ''}`}
        data-testid="pref-switch-digest"
        onClick={toggle}
      >
        <span className="um-switch-text">
          <span className="um-switch-label">Daily digest</span>
          <span className="faint" style={{ display: 'block', fontSize: '.78rem', marginTop: '.15rem' }}>
            Bundle extra requests, review nudges, and property knowledge into one morning email.
            Urgent paths — escalations, service, guest messages — always arrive instantly.
          </span>
        </span>
        <span className="um-switch" data-on={enabled} aria-hidden>
          <span className="um-switch-thumb" />
        </span>
      </button>
      {error ? (
        <p role="alert" style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: 'var(--coral)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
