'use client';

// The host-facing surface for registry completeness. Before this existed the
// completeness calculation had no consumers at all: the 65% ship threshold and
// the hard-block list were computed and thrown away.
//
// Three jobs, in priority order:
//   1. Say whether the property can be published, and if not, exactly why.
//   2. Show the per-category breakdown so the number is explainable, not a
//      mystery score.
//   3. Let the host declare which features exist, because a field that does not
//      apply must leave the denominator rather than sit there as a permanent gap.

import { useActionState } from 'react';
import {
  migrateLegacyNotesAction,
  setApplicabilityAction,
  type ApplicabilityState,
  type MigrationActionState,
} from './completeness-actions';

export interface CompletenessDomainView {
  domain: string;
  /** Registry-authored label, resolved server-side so the registry JSON stays out of the client bundle. */
  label: string;
  pct: number;
  weight: number;
  gapCount: number;
}

export interface CompletenessGapView {
  fieldId: string;
  label: string;
  domain: string;
  status: string;
  hardBlock: boolean;
  interviewPrompt: string;
}

export interface PredicateView {
  predicate: string;
  label: string;
  /** null = never answered. */
  applies: boolean | null;
  fieldCount: number;
}

interface Props {
  propertyId: string;
  canEdit: boolean;
  pct: number;
  threshold: number;
  numerator: number;
  denominator: number;
  canPublish: boolean;
  blockedReason: string | null;
  domains: CompletenessDomainView[];
  hardBlocks: CompletenessGapView[];
  topGaps: CompletenessGapView[];
  predicates: PredicateView[];
  /** Gating is only advisory unless the deployment enforces it. */
  enforced: boolean;
}

function Bar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: 'var(--border)',
        overflow: 'hidden',
        marginTop: '.25rem',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          borderRadius: 999,
          background: pct >= 65 ? 'var(--teal)' : pct >= 30 ? 'var(--coral)' : 'var(--text-faint)',
          // Width is a layout property, but this bar animates once on navigation
          // and never during scroll or interaction, so there is no frame budget
          // to protect here. transform: scaleX would blur the rounded cap.
          transition: 'width .3s ease-out',
        }}
      />
    </div>
  );
}

function PredicateToggle({
  propertyId,
  item,
  canEdit,
}: {
  propertyId: string;
  item: PredicateView;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ApplicabilityState, FormData>(
    setApplicabilityAction,
    {},
  );
  // Unanswered and "no" both keep the fields out of the denominator, so the only
  // meaningful toggle is yes/no. Answering "no" is still recorded so the panel
  // can stop presenting it as an open question.
  const next = item.applies === true ? 'false' : 'true';

  return (
    <form action={action} style={{ display: 'contents' }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="predicate" value={item.predicate} />
      <input type="hidden" name="applies" value={next} />
      <button
        type="submit"
        disabled={!canEdit || pending}
        aria-pressed={item.applies === true}
        title={
          item.applies === true
            ? `Adds ${item.fieldCount} question${item.fieldCount === 1 ? '' : 's'} to your checklist`
            : 'Not at this property'
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.4rem',
          width: '100%',
          textAlign: 'left',
          fontSize: '.78rem',
          padding: '.35rem .5rem',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: item.applies === true ? 'var(--teal-dim, rgba(51,230,212,.12))' : 'transparent',
          color: item.applies === true ? 'var(--text)' : 'var(--text-faint)',
          cursor: canEdit ? 'pointer' : 'default',
          opacity: pending ? 0.6 : 1,
          // Colour and background only: this control sits in a list of eleven and
          // is clicked repeatedly, so it gets feedback without movement.
          transition: 'background .15s ease-out, color .15s ease-out',
        }}
      >
        <span aria-hidden style={{ fontFamily: 'monospace' }}>
          {item.applies === true ? '\u2713' : item.applies === false ? '\u2013' : '\u00b7'}
        </span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.applies === true && item.fieldCount > 0 && (
          <span className="faint" style={{ fontSize: '.7rem' }}>
            +{item.fieldCount}
          </span>
        )}
      </button>
      {state.error && (
        <span role="alert" style={{ fontSize: '.7rem', color: 'var(--coral)' }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

function ScanNotes({ propertyId, canEdit }: { propertyId: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState<MigrationActionState, FormData>(
    migrateLegacyNotesAction,
    {},
  );
  if (!canEdit) return null;

  return (
    <form action={action} style={{ marginTop: '.9rem' }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <button type="submit" className="btn btn-sm btn-ghost btn-block" disabled={pending}>
        {pending ? 'Reading your notes…' : 'Fill from my existing notes'}
      </button>
      <p
        className="faint"
        style={{ fontSize: '.7rem', marginTop: '.35rem' }}
        // aria-live so the result is announced: this button can legitimately
        // report "found nothing", and a silent no-op reads as a broken control.
        aria-live="polite"
      >
        {state.error ?? state.message ?? 'We suggest answers from what you have already written. You approve each one.'}
      </p>
    </form>
  );
}

export function CompletenessPanel({
  propertyId,
  canEdit,
  pct,
  threshold,
  numerator,
  denominator,
  canPublish,
  blockedReason,
  domains,
  hardBlocks,
  topGaps,
  predicates,
  enforced,
}: Props) {
  const blockedCopy =
    blockedReason === 'both'
      ? `Below ${threshold}% and missing must-have answers.`
      : blockedReason === 'below_threshold'
        ? `Needs ${threshold}% to publish.`
        : blockedReason === 'hard_blocks_outstanding'
          ? 'Missing must-have answers.'
          : null;

  return (
    <div className="card" style={{ padding: '1.25rem' }} data-testid="completeness-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Guest-ready</h3>
        <span
          style={{ fontSize: '1.35rem', fontVariantNumeric: 'tabular-nums' }}
          data-testid="completeness-pct"
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <Bar pct={pct} />
      <p className="faint" style={{ fontSize: '.72rem', marginTop: '.45rem' }}>
        {/* The raw fraction is shown so the percentage is auditable rather than magic. */}
        {numerator.toFixed(1)} of {denominator.toFixed(1)} weighted answers · {threshold}% to publish
      </p>

      {blockedCopy ? (
        <p
          style={{ fontSize: '.78rem', marginTop: '.6rem', color: 'var(--coral)' }}
          data-testid="completeness-blocked"
        >
          {blockedCopy}
          {!enforced && (
            <span className="faint">
              {' '}
              Publishing is not blocked in this environment.
            </span>
          )}
        </p>
      ) : (
        <p style={{ fontSize: '.78rem', marginTop: '.6rem', color: 'var(--teal)' }}>
          Ready to publish.
        </p>
      )}

      {hardBlocks.length > 0 && (
        <div style={{ marginTop: '.9rem' }}>
          <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em' }} className="faint">
            Must have
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: '.4rem 0 0' }}>
            {hardBlocks.map((g) => (
              <li key={g.fieldId} style={{ fontSize: '.78rem', padding: '.2rem 0' }}>
                <span style={{ color: 'var(--coral)' }} aria-hidden>
                  ●{' '}
                </span>
                {g.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em' }} className="faint">
          By category
        </h4>
        {domains.length === 0 && (
          <p className="faint" style={{ fontSize: '.75rem', marginTop: '.35rem' }}>
            Nothing scored yet.
          </p>
        )}
        {domains.map((d) => (
          <div key={d.domain} style={{ padding: '.35rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem' }}>
              <span>{d.label}</span>
              <span className="faint" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {d.pct.toFixed(0)}%
              </span>
            </div>
            <Bar pct={d.pct} />
          </div>
        ))}
      </div>

      {topGaps.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em' }} className="faint">
            Next questions
          </h4>
          <ol style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
            {topGaps.map((g) => (
              <li key={g.fieldId} style={{ fontSize: '.78rem', padding: '.2rem 0' }}>
                {/* Registry copy, never model-authored. */}
                {g.interviewPrompt}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em' }} className="faint">
          What this place has
        </h4>
        <p className="faint" style={{ fontSize: '.72rem', margin: '.25rem 0 .5rem' }}>
          Only the features you mark are counted, so you are never scored on a pool you do not have.
        </p>
        <div style={{ display: 'grid', gap: '.3rem' }}>
          {predicates.map((p) => (
            <PredicateToggle key={p.predicate} propertyId={propertyId} item={p} canEdit={canEdit} />
          ))}
        </div>
      </div>

      <ScanNotes propertyId={propertyId} canEdit={canEdit} />
    </div>
  );
}
