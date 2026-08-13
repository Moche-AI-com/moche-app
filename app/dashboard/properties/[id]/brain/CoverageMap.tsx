'use client';

// Read-only Coverage Map (§7.5). Optional and collapsed by default: the cards and the
// three action queues are where work happens, and a map that opens by default competes
// with them for the host's first glance.
//
// Deliberately has no edit affordance. A clickable node would turn the map into a second
// editing entry point with none of the guardrails the card editor has.

import { useState } from 'react';
import type { CoverageMapView, CoverageState } from '@/lib/brain/coverage';

const STATE_COLOR: Record<CoverageState, string> = {
  satisfied: 'var(--teal)',
  partial: 'var(--gold, #c9a227)',
  blocking: 'var(--coral)',
  missing: 'var(--border)',
};

const STATE_LABEL: Record<CoverageState, string> = {
  satisfied: 'Answered',
  partial: 'Partial',
  blocking: 'Blocking launch',
  missing: 'Not answered',
};

const SIZE = 520;
const CENTER = SIZE / 2;
const HUB_RADIUS = SIZE * 0.32;
const CLUSTER_RADIUS = SIZE * 0.1;

export function CoverageMap({ view }: { view: CoverageMapView }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ label: string; state: CoverageState; domain: string } | null>(null);

  return (
    <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-ghost btn-sm"
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        data-testid="coverage-map-toggle"
      >
        <span style={{ fontSize: '1rem', fontWeight: 600 }}>Coverage Map</span>
        <span className="faint" style={{ fontSize: '.78rem' }}>
          {view.totals.satisfied} answered · {view.totals.blocking + view.totals.missing + view.totals.partial} open
          {open ? ' ▲' : ' ▼'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: '1rem' }}>
          <p className="faint" style={{ fontSize: '.75rem', marginBottom: '.75rem' }}>
            Every field the launch score counts, grouped by category. Read-only — edit from the cards above.
          </p>

          <div style={{ position: 'relative' }}>
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`Coverage map: ${view.totals.satisfied} answered, ${view.totals.blocking} blocking launch, ${view.totals.missing} not answered, ${view.totals.partial} partial`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            >
              {view.domains.map((d) => {
                const hx = CENTER + d.x * HUB_RADIUS;
                const hy = CENTER + d.y * HUB_RADIUS;
                return (
                  <g key={d.domain}>
                    <line x1={CENTER} y1={CENTER} x2={hx} y2={hy} stroke="var(--border)" strokeWidth={1} />
                    {d.fields.map((f) => {
                      const fx = hx + f.x * CLUSTER_RADIUS;
                      const fy = hy + f.y * CLUSTER_RADIUS;
                      return (
                        <g key={f.fieldId}>
                          <line x1={hx} y1={hy} x2={fx} y2={fy} stroke="var(--border)" strokeWidth={0.75} />
                          <circle
                            cx={fx}
                            cy={fy}
                            r={f.hardBlock ? 6 : 4.5}
                            fill={STATE_COLOR[f.state]}
                            stroke="var(--bg)"
                            strokeWidth={1}
                            onMouseEnter={() => setHover({ label: f.label, state: f.state, domain: d.label })}
                            onMouseLeave={() => setHover(null)}
                            style={{ cursor: 'default' }}
                          />
                        </g>
                      );
                    })}
                    <circle cx={hx} cy={hy} r={13} fill="var(--bg)" stroke="var(--border)" strokeWidth={1.5} />
                    <text
                      x={hx}
                      y={hy + 3.5}
                      textAnchor="middle"
                      style={{ fontSize: 9, fill: 'var(--text)' }}
                    >
                      {Math.round(d.pct)}
                    </text>
                    <text
                      x={hx}
                      y={hy + 26}
                      textAnchor="middle"
                      style={{ fontSize: 9, fill: 'var(--text-faint)' }}
                    >
                      {d.label.length > 18 ? `${d.label.slice(0, 17)}…` : d.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hover && (
              <div
                aria-live="polite"
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '.4rem .6rem',
                  fontSize: '.75rem',
                  pointerEvents: 'none',
                }}
              >
                <strong>{hover.label}</strong>
                <span className="faint"> · {hover.domain} · {STATE_LABEL[hover.state]}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginTop: '.75rem' }}>
            {(Object.keys(STATE_LABEL) as CoverageState[]).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem' }}>
                <span
                  aria-hidden
                  style={{ width: 9, height: 9, borderRadius: 999, background: STATE_COLOR[s], display: 'inline-block' }}
                />
                {STATE_LABEL[s]} ({view.totals[s]})
              </span>
            ))}
            {view.notApplicableCount > 0 && (
              <span className="faint" style={{ fontSize: '.72rem' }}>
                {view.notApplicableCount} not applicable to this property
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
