'use client';

// Client half of the unified Spaces & features surface (slice 2).
// Every write goes through the EXISTING, tested server actions —
// setApplicabilityAction (completeness-actions.ts) and archiveFeatureAction
// (feature-actions.ts) — so permission checks (can_edit_property / editBrain),
// audit logging, and RLS behavior are identical to the current panels.

import { useActionState } from 'react';
import { setApplicabilityAction } from '../completeness-actions';
import { archiveFeatureAction } from '../feature-actions';

export type PredicateRow = {
  predicate: string;
  label: string;
  gatedCount: number;
  applies: boolean | null;
};

export type FeatureRow = {
  id: string;
  label: string;
  location: string | null;
  guest_access: string;
  notes: string | null;
  created_via: string;
  archived_at: string | null;
};

const ACCESS_LABEL: Record<string, string> = {
  yes: 'Guests can use it',
  supervised: 'Ask host / supervised',
  no: 'Host only',
};

const buttonStyle = {
  padding: '0.25rem 0.6rem',
  fontSize: '.8rem',
  borderRadius: '8px',
  border: '1px solid rgba(128,128,128,.4)',
  background: 'transparent',
  cursor: 'pointer',
} as const;

export function SpacesClient({
  propertyId,
  predicates,
  features,
}: {
  propertyId: string;
  predicates: PredicateRow[];
  features: FeatureRow[];
}) {
  const [appState, appAction] = useActionState(setApplicabilityAction, {});
  const activeFeatures = features.filter((f) => !f.archived_at);

  return (
    <>
      <h2 style={{ fontSize: '1.05rem', margin: '1.75rem 0 0.25rem' }}>What this place has</h2>
      <p style={{ margin: 0, opacity: 0.7, fontSize: '.85rem' }}>
        Each answer adds or removes the answers the brain expects for this property — and what the
        go-live gate requires.
      </p>
      {appState?.error ? (
        <p style={{ color: '#dc2626', fontSize: '.85rem' }}>{appState.error}</p>
      ) : null}
      <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
        {predicates.map((row) => {
          const dot =
            row.applies === null ? 'rgba(128,128,128,.6)' : row.applies ? '#16a34a' : '#dc2626';
          const state = row.applies === null ? 'Not answered' : row.applies ? 'Yes' : 'No';
          return (
            <li
              key={row.predicate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0',
                borderBottom: '1px solid rgba(128,128,128,.2)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  flexShrink: 0,
                  backgroundColor: dot,
                }}
              />
              <span style={{ flex: 1 }}>
                {row.label}
                <span style={{ opacity: 0.6, fontSize: '.8rem' }}>
                  {' '}
                  · gates {row.gatedCount} {row.gatedCount === 1 ? 'answer' : 'answers'}
                </span>
              </span>
              <span style={{ fontSize: '.8rem', opacity: 0.75, minWidth: '5.5rem', textAlign: 'right' }}>
                {state}
              </span>
              {(['true', 'false'] as const).map((v) => (
                <form key={v} action={appAction} style={{ display: 'inline' }}>
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="predicate" value={row.predicate} />
                  <input type="hidden" name="applies" value={v} />
                  <button type="submit" style={buttonStyle}>
                    {v === 'true' ? 'Yes' : 'No'}
                  </button>
                </form>
              ))}
            </li>
          );
        })}
      </ul>

      <h2 style={{ fontSize: '1.05rem', margin: '2rem 0 0.25rem' }}>Your own spaces</h2>
      <p style={{ margin: 0, opacity: 0.7, fontSize: '.85rem' }}>
        Custom spaces each become their own brain section. Add them from the Manage Brain page;
        they are listed and archived here.
      </p>
      {activeFeatures.length === 0 ? (
        <p style={{ opacity: 0.75, fontSize: '.85rem' }}>
          No custom spaces yet — pool, grill, shed, anything. Each one becomes its own section you
          can file knowledge under.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
          {activeFeatures.map((f) => (
            <li
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0',
                borderBottom: '1px solid rgba(128,128,128,.2)',
              }}
            >
              <span style={{ flex: 1 }}>
                {f.label}
                <span style={{ opacity: 0.6, fontSize: '.8rem' }}>
                  {f.location ? ` · ${f.location}` : ''} ·{' '}
                  {ACCESS_LABEL[f.guest_access] ?? f.guest_access}
                </span>
              </span>
              <form action={archiveFeatureAction} style={{ display: 'inline' }}>
                <input type="hidden" name="propertyId" value={propertyId} />
                <input type="hidden" name="featureId" value={f.id} />
                <button type="submit" style={buttonStyle}>
                  Archive
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
