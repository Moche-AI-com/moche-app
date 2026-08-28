'use client';

import { useState, useTransition } from 'react';
import { Lock } from 'lucide-react';
import { setNotificationPreferenceAction } from './actions';

export interface CategoryPreference {
  key: string;
  label: string;
  description: string;
  alwaysOn: boolean;
  enabled: boolean;
}

// Per-category subscribe/unsubscribe switches. Optimistic: the switch flips
// immediately and snaps back if the server rejects the change. The server
// re-validates the category and hard-rejects always-on paths, so a tampered
// client can never mute host messages, billing, or security alerts. Switch
// markup reuses the um-switch classes from User management for visual parity.
export function NotificationPreferencesForm({ categories }: { categories: CategoryPreference[] }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [c.key, c.enabled])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function toggle(cat: CategoryPreference) {
    if (cat.alwaysOn || pending[cat.key]) return;
    const previous = enabled[cat.key] ?? true;
    const next = !previous;
    setEnabled((s) => ({ ...s, [cat.key]: next }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[cat.key];
      return copy;
    });
    setPending((p) => ({ ...p, [cat.key]: true }));
    startTransition(async () => {
      const res = await setNotificationPreferenceAction({ category: cat.key, enabled: next });
      setPending((p) => ({ ...p, [cat.key]: false }));
      if (!res?.ok) {
        setEnabled((s) => ({ ...s, [cat.key]: previous }));
        setErrors((e) => ({ ...e, [cat.key]: res?.error ?? 'Could not save that change. Try again.' }));
      }
    });
  }

  const toggleable = categories.filter((c) => !c.alwaysOn);
  const locked = categories.filter((c) => c.alwaysOn);

  return (
    <div>
      <div className="um-switch-list">
        {toggleable.map((cat) => {
          const on = enabled[cat.key] ?? true;
          return (
            <div key={cat.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={cat.label}
                disabled={!!pending[cat.key]}
                className={`um-switch-row${on ? ' is-on' : ''}`}
                data-testid={`pref-switch-${cat.key}`}
                onClick={() => toggle(cat)}
              >
                <span className="um-switch-text">
                  <span className="um-switch-label">{cat.label}</span>
                  <span className="faint" style={{ display: 'block', fontSize: '.78rem', marginTop: '.15rem' }}>
                    {cat.description}
                  </span>
                </span>
                <span className="um-switch" data-on={on} aria-hidden>
                  <span className="um-switch-thumb" />
                </span>
              </button>
              {errors[cat.key] ? (
                <p role="alert" style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: 'var(--coral)' }}>
                  {errors[cat.key]}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p
        className="faint"
        style={{ margin: '1.25rem 0 .5rem', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}
      >
        Always on
      </p>
      <div className="um-switch-list">
        {locked.map((cat) => (
          // Not a button: there is nothing to press. The static switch visual
          // plus the badge makes the state readable without implying an action.
          <div
            key={cat.key}
            className="um-switch-row is-on"
            data-testid={`pref-locked-${cat.key}`}
            style={{ cursor: 'default' }}
          >
            <span className="um-switch-text">
              <span
                className="um-switch-label"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}
              >
                {cat.label}
                <span
                  className="badge badge-teal"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', fontSize: '.68rem' }}
                >
                  <Lock size={10} aria-hidden /> Always on
                </span>
              </span>
              <span className="faint" style={{ display: 'block', fontSize: '.78rem', marginTop: '.15rem' }}>
                {cat.description}
              </span>
            </span>
            <span className="um-switch" data-on="true" aria-hidden>
              <span className="um-switch-thumb" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
