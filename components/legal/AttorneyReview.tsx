import type { ReactNode } from 'react';

// Wraps a high-risk clause (liability caps, indemnity, governing law, legal
// bases, transfer mechanisms, breach-notice terms) with a visible banner so no
// clause ships to production without counsel signing off. The banner is printed
// too — reviewers working from a PDF still see it. See docs/compliance/README.md
// for the full inventory of flagged clauses.
export function AttorneyReview({ topic, children }: { topic?: string; children?: ReactNode }) {
  return (
    <aside
      className="attorney-review"
      data-testid="attorney-review"
      role="note"
      aria-label="Attorney review required"
      style={{
        border: '1px solid var(--coral, #e2725b)',
        borderLeftWidth: 4,
        background: 'rgba(226,114,91,0.06)',
        borderRadius: 8,
        padding: '.85rem 1rem',
        margin: '1rem 0',
        fontSize: '.9rem',
      }}
    >
      <p
        style={{
          margin: 0,
          fontWeight: 700,
          letterSpacing: '.02em',
          color: 'var(--coral, #e2725b)',
          fontSize: '.72rem',
          textTransform: 'uppercase',
        }}
      >
        [Attorney Review Required]{topic ? ` — ${topic}` : ''}
      </p>
      {children ? <div style={{ marginTop: '.5rem' }}>{children}</div> : null}
    </aside>
  );
}
