'use client';

// The Coverage Map, now the orientation surface at the top of the Brain page (§4).
//
// Three deliberate constraints:
//   1. Expanded on open. It used to be collapsed because it sat below the cards and
//      competed with them; the cards are gone, so the map is the first thing a host
//      should read. A collapsed map at the top of the page is a header, not a map.
//   2. Hover-only. Every node has hover feedback and no click handler, no href, no
//      tabIndex, no role="button" (§4, §9). A clickable node would be a second editing
//      entry point with none of the editor's guardrails, and the directive forbids it.
//   3. Not-applicable topics read as "N/A" (§7), never as a grey gap dot, and never
//      subtract from the percentage — the score already omits them from its denominator.
//
// Motion lives in CSS classes (.coverage-*) rather than inline styles so the
// prefers-reduced-motion block in globals.css can switch it off; an inline transition
// cannot be overridden by a media query.

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

interface HoverTarget {
  /** Present for a field node; absent when the whole domain hub is hovered. */
  fieldId?: string;
  label?: string;
  state?: CoverageState;
  domain: string;
  domainLabel: string;
  /** Domain-level summary, shown when the hub itself is hovered. */
  summary?: string;
}

export function CoverageMap({ view }: { view: CoverageMapView }) {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState<HoverTarget | null>(null);

  const openCount = view.totals.blocking + view.totals.missing + view.totals.partial;

  return (
    <section className="card coverage-map" data-testid="coverage-map">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-ghost coverage-map-toggle"
        data-testid="coverage-map-toggle"
      >
        <span className="coverage-map-title">Coverage Map</span>
        <span className="faint coverage-map-summary">
          {view.totals.satisfied} answered · {openCount} open
          {view.notApplicableCount > 0 && ` · ${view.notApplicableCount} N/A`}
          {open ? ' ▲' : ' ▼'}
        </span>
      </button>

      {open && (
        <div className="coverage-map-body">
          <p className="faint coverage-map-help">
            Every field your launch score counts, grouped by section. Hover a dot to see what it
            is — the map is a read-out, not a control.
          </p>

          <div className="coverage-map-canvas">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`Coverage map: ${view.totals.satisfied} answered, ${view.totals.blocking} blocking launch, ${view.totals.partial} partial, ${view.totals.missing} not answered, ${view.notApplicableCount} not applicable`}
              className="coverage-map-svg"
            >
              {view.domains.map((d) => {
                const hx = CENTER + d.x * HUB_RADIUS;
                const hy = CENTER + d.y * HUB_RADIUS;
                // Dim every other cluster while one is hovered, so a 53-dot map reads as
                // one section at a time instead of a constellation.
                const dimmed = hover !== null && hover.domain !== d.domain;
                return (
                  <g key={d.domain} className={`coverage-cluster${dimmed ? ' is-dimmed' : ''}`}>
                    <line x1={CENTER} y1={CENTER} x2={hx} y2={hy} stroke="var(--border)" strokeWidth={1} />
                    {d.fields.map((f) => {
                      const fx = hx + f.x * CLUSTER_RADIUS;
                      const fy = hy + f.y * CLUSTER_RADIUS;
                      // Match on field_id, not label: registry labels are not unique
                      // across sections and a collision would light up two dots at once.
                      const active = hover?.fieldId === f.fieldId;
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
                            className={`coverage-node${active ? ' is-active' : ''}`}
                            onMouseEnter={() =>
                              setHover({
                                fieldId: f.fieldId,
                                label: f.label,
                                state: f.state,
                                domain: d.domain,
                                domainLabel: d.label,
                              })
                            }
                            onMouseLeave={() => setHover(null)}
                          />
                        </g>
                      );
                    })}
                    <circle
                      cx={hx}
                      cy={hy}
                      r={13}
                      fill="var(--bg)"
                      stroke={hover?.domain === d.domain ? 'var(--teal)' : 'var(--border)'}
                      strokeWidth={1.5}
                      className="coverage-hub"
                      onMouseEnter={() =>
                        setHover({
                          domain: d.domain,
                          domainLabel: d.label,
                          summary:
                            d.gapCount === 0
                              ? `all ${d.fieldCount} answered`
                              : `${d.fieldCount - d.gapCount} of ${d.fieldCount} answered`,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                    <text x={hx} y={hy + 3.5} textAnchor="middle" className="coverage-hub-pct">
                      {Math.round(d.pct)}
                    </text>
                    <text x={hx} y={hy + 26} textAnchor="middle" className="coverage-hub-label">
                      {d.label.length > 18 ? `${d.label.slice(0, 17)}…` : d.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* aria-live so a keyboard or screen-reader user is told what the sighted
                hover reveals; the map itself carries a full summary in aria-label. */}
            <div aria-live="polite" className="coverage-readout" data-testid="coverage-map-readout">
              {hover && (
                <span className="coverage-readout-inner">
                  <strong>{hover.label ?? hover.domainLabel}</strong>
                  <span className="faint">
                    {hover.label
                      ? ` · ${hover.domainLabel} · ${STATE_LABEL[hover.state ?? 'missing']}`
                      : ` · ${hover.summary}`}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="coverage-legend">
            {(Object.keys(STATE_LABEL) as CoverageState[]).map((s) => (
              <span key={s} className="coverage-legend-item">
                <span aria-hidden className="coverage-swatch" style={{ background: STATE_COLOR[s] }} />
                {STATE_LABEL[s]} ({view.totals[s]})
              </span>
            ))}
            {view.notApplicableCount > 0 && (
              <span className="coverage-legend-item faint" data-testid="coverage-na-total">
                <span aria-hidden className="coverage-swatch coverage-swatch-na" />
                N/A ({view.notApplicableCount}) — not counted either way
              </span>
            )}
          </div>

          {(view.notApplicableDomains.length > 0 ||
            view.domains.some((d) => d.notApplicableCount > 0)) && (
            <div className="coverage-na-list" data-testid="coverage-na-list">
              <h4 className="faint coverage-na-heading">Marked N/A at this property</h4>
              <div className="coverage-na-chips">
                {view.domains
                  .filter((d) => d.notApplicableCount > 0)
                  .map((d) => (
                    <span key={d.domain} className="coverage-na-chip">
                      {d.label}
                      <span className="faint"> · {d.notApplicableCount} N/A</span>
                    </span>
                  ))}
                {view.notApplicableDomains.map((d) => (
                  <span key={d.domain} className="coverage-na-chip">
                    {d.label}
                    <span className="faint"> · N/A</span>
                  </span>
                ))}
              </div>
              <p className="faint coverage-na-note">
                These are out of your score entirely — marking something N/A can never lower your
                percentage. Change what applies under “What this place has”.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
