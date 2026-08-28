'use client';

import { useEffect, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { addPropertyMuteAction, removePropertyMuteAction } from './actions';

export interface PropertyOption {
  id: string;
  name: string;
}

export interface PropertyMuteEntry {
  id: string;
  propertyId: string;
  categoryKey: string;
}

export interface MuteableCategory {
  key: string;
  label: string;
}

// Per-property mutes: "no extras pings from the beach house" without touching
// the account-wide switches. Mutes are removable chips grouped in one list,
// plus a two-select add row. Server actions re-validate category and property
// ownership; RLS scopes every row to the member.
export function PropertyMutes({
  properties,
  mutes: initialMutes,
  categories,
}: {
  properties: PropertyOption[];
  mutes: PropertyMuteEntry[];
  categories: MuteableCategory[];
}) {
  const [mutes, setMutes] = useState(initialMutes);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [category, setCategory] = useState(categories[0]?.key ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  // Re-sync from the server after revalidatePath refreshes the props.
  useEffect(() => {
    setMutes(initialMutes);
  }, [initialMutes]);

  function propertyName(id: string): string {
    return properties.find((p) => p.id === id)?.name ?? 'Unknown property';
  }

  function categoryLabel(key: string): string {
    return categories.find((c) => c.key === key)?.label ?? key;
  }

  function add() {
    if (pending || !propertyId || !category) return;
    if (mutes.some((m) => m.propertyId === propertyId && m.categoryKey === category)) {
      setError('That path is already muted for this property.');
      return;
    }
    setPending(true);
    setError(null);
    startTransition(async () => {
      const res = await addPropertyMuteAction({ propertyId, category });
      setPending(false);
      if (!res?.ok) setError(res?.error ?? 'Could not add that mute. Try again.');
      // On success revalidatePath refreshes the server props; the useEffect above
      // re-seats the list (including the real id of the new row).
    });
  }

  function remove(id: string) {
    const previous = mutes;
    setMutes((current) => current.filter((m) => m.id !== id));
    setError(null);
    startTransition(async () => {
      const res = await removePropertyMuteAction(id);
      if (!res?.ok) {
        setMutes(previous);
        setError(res?.error ?? 'Could not remove that mute. Try again.');
      }
    });
  }

  return (
    <div>
      {mutes.length === 0 ? (
        <p className="faint" style={{ fontSize: '.8rem', margin: 0 }}>
          No per-property mutes. Every path above reaches you for every property.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
          {mutes.map((m) => (
            <li key={m.id}>
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                {propertyName(m.propertyId)} · {categoryLabel(m.categoryKey)}
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  aria-label={`Remove the ${categoryLabel(m.categoryKey)} mute at ${propertyName(m.propertyId)}`}
                  data-testid={`unmute-${m.id}`}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {properties.length > 0 && categories.length > 0 ? (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.85rem', alignItems: 'center' }}>
          <select
            className="select"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="Property"
            style={{ maxWidth: 220 }}
            data-testid="mute-property-select"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Notification path"
            style={{ maxWidth: 220 }}
            data-testid="mute-category-select"
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={add}
            disabled={pending || !propertyId || !category}
            data-testid="button-add-mute"
          >
            Mute this path here
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: '.5rem 0 0', fontSize: '.78rem', color: 'var(--coral)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
