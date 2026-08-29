'use client';

// Onboarding "What does this place have?" (2026-08-28). One tap per catalog entry
// creates a feature as its own Brain section — pool, grill, EV charger — so the
// concierge can answer questions about it from day one. Details (where it is, guest
// access, notes) are filled in later on the Brain page's Spaces & features panel;
// this step only captures existence. Re-runs are idempotent (the server action skips
// names the property already has), so a host who revisits this page can't duplicate.

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { Check, Plus } from 'lucide-react';
import { FEATURE_CATALOG } from '@/lib/brain/taxonomy';
import {
  addFeaturesFromChecklistAction,
  type FeatureActionState,
} from '@/app/dashboard/properties/[id]/brain/feature-actions';

export function FeatureChecklist({ propertyId }: { propertyId: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction] = useFormState<FeatureActionState, FormData>(addFeaturesFromChecklistAction, {});
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (state.ok) setDone(true);
  }, [state]);

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <details className="card" style={{ padding: '1rem' }} data-testid="feature-checklist">
      <summary style={{ cursor: 'pointer' }}>
        <strong>What does this place have?</strong>{' '}
        {done ? <span className="badge">Added</span> : <span className="badge">Recommended</span>}
      </summary>
      <div style={{ marginTop: '.75rem' }}>
        <p className="faint" style={{ marginTop: 0 }}>
          Tap what applies — pool, grill, EV charger, anything. Each becomes its own section in
          the property&apos;s Brain, so the concierge can answer guest questions about it from day one.
          Where it is, house rules for it, and notes are added anytime on the Brain page.
        </p>
        <form action={formAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <div className="brain-empty-chips" role="group" aria-label="Feature checklist">
            {FEATURE_CATALOG.map((e) => {
              const on = selected.has(e.key);
              return (
                <label
                  key={e.key}
                  className="brain-empty-chip"
                  title={e.hint}
                  style={{
                    cursor: 'pointer',
                    ...(on
                      ? { borderColor: 'var(--teal)', color: 'var(--text)', background: 'var(--surface)' }
                      : {}),
                  }}
                  data-testid={`checklist-${e.key}`}
                >
                  <input
                    type="checkbox"
                    name="keys"
                    value={e.key}
                    checked={on}
                    onChange={() => toggle(e.key)}
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                  />
                  {on ? <Check size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
                  {e.label}
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: '.85rem', display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="button" type="submit" disabled={selected.size === 0}>
              {selected.size > 0 ? `Add ${selected.size} to the Brain` : 'Add to the Brain'}
            </button>
            {done && (
              <span className="badge">Added — details live under Spaces &amp; features on the Brain page</span>
            )}
          </div>
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
        </form>
      </div>
    </details>
  );
}
