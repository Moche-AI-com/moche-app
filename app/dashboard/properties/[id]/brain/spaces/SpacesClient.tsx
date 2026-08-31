'use client';

// "What this place has" — the registry applicability board (slice 2). This component
// owns exactly one job: the Yes/No answers that drive the completeness denominator and
// the go-live gate. Custom spaces are managed by the Features panel directly below on
// the same page, which is the fuller manager (catalog picker, edit, Draft with AI,
// archive) — earlier revisions of this client carried a read-only list that duplicated
// it, and duplication on one page is worse than either surface alone.

import { useActionState } from 'react';
import { setApplicabilityAction } from '../completeness-actions';

export type PredicateRow = {
  predicate: string;
  label: string;
  gatedCount: number;
  applies: boolean | null;
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
}: {
  propertyId: string;
  predicates: PredicateRow[];
}) {
  const [appState, appAction] = useActionState(setApplicabilityAction, {});

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
    </>
  );
}
