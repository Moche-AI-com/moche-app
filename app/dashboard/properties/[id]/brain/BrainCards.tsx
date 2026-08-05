'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Network, LayoutGrid } from 'lucide-react';
import type { CardBrainHealth, CardHealth } from '@/lib/brain/health';
import type { Readiness } from '@/lib/brain/readiness';
import { BrainGraph, type GraphItem } from './BrainGraph';

function scoreColor(pct: number): string {
  return pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--iris)' : 'var(--coral)';
}

const CARD_IMAGES: Record<string, string> = {
  core: '/brain-cards/core.webp',
  safety: '/brain-cards/safety.webp',
  rules: '/brain-cards/rules.webp',
  home: '/brain-cards/home.webp',
  appliances: '/brain-cards/appliances.webp',
  local: '/brain-cards/local.webp',
  escalation: '/brain-cards/escalation.webp',
  transportation: '/brain-cards/transportation.webp',
};

const BUILDER_CARD_CSS = `
.bc-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  height: 100%;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: transform .22s cubic-bezier(.2,.7,.3,1), box-shadow .22s ease, border-color .22s ease;
}
.bc-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-strong);
  box-shadow: 0 18px 40px -18px rgba(0,0,0,.6), 0 0 0 1px rgba(51,230,212,.18);
}
.bc-card:focus-visible {
  outline: none;
  border-color: var(--teal);
  box-shadow: 0 0 0 2px rgba(51,230,212,.4);
}
.bc-media {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--surface-2);
}
.bc-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .4s cubic-bezier(.2,.7,.3,1);
}
.bc-card:hover .bc-media img { transform: scale(1.06); }
.bc-media::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(14,24,38,0) 35%, rgba(14,24,38,.55) 78%, rgba(14,24,38,.9) 100%);
}
.bc-media-badge {
  position: absolute;
  top: .6rem;
  right: .6rem;
  z-index: 2;
}
.bc-body {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  padding: .95rem 1.05rem 1.05rem;
  flex: 1;
}
.bc-blurb {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.1rem;
  line-height: 1.05rem;
}
.bc-footer { margin-top: auto; }
.bc-checklist-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--teal);
  cursor: pointer;
  text-align: left;
}
.bc-checklist-btn:hover { text-decoration: underline; }
`;

export function BrainCards({
  propertyId,
  propertyName,
  propertySlug,
  health,
  readiness,
  canEdit,
  graphItems,
  categoryLabels,
}: {
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  health: CardBrainHealth;
  readiness: Readiness;
  canEdit: boolean;
  graphItems: GraphItem[];
  categoryLabels: Record<string, string>;
}) {
  const [view, setView] = useState<'graph' | 'cards'>('graph');
  const guestPortalUrl = `/g/${propertySlug}`;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <style dangerouslySetInnerHTML={{ __html: BUILDER_CARD_CSS }} />
      {/* Health hero */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }} data-testid="brain-health-hero">
        <div className="brain-health-hero-row">
          <ScoreRing score={health.score} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.2rem' }}>Brain Health</h2>
              <span className={`badge ${health.score >= 80 ? 'badge-teal' : health.score >= 50 ? '' : 'badge-coral'}`} data-testid="health-label">{health.label}</span>
            </div>
            <p className="muted" style={{ fontSize: '.85rem', marginTop: '.4rem' }}>
              {health.criticalComplete
                ? 'Guest-critical cards are complete — your concierge is ready for guests.'
                : 'Finish the guest-critical cards (Core, Safety, Rules) to get your concierge guest-ready.'}
            </p>
          </div>
          {/* Opens the real guest portal in a new tab — what a guest actually sees. */}
          <a
            className="btn btn-primary"
            href={guestPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="button-preview-guest"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
          >
            Preview as guest <ExternalLink size={15} />
          </a>
        </div>

        {/* Launch readiness. Distinct from Brain Health on purpose: health asks
            "how full is this Brain", readiness asks "is this safe to put in
            front of a guest", which includes having reviewed what the AI wrote. */}
        <div
          style={{ borderTop: '1px solid var(--border)', marginTop: '1.1rem', paddingTop: '1rem' }}
          data-testid="brain-readiness"
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
            <h3 style={{ fontSize: '.95rem', margin: 0 }}>Launch readiness</h3>
            <span
              className={`badge ${readiness.ready ? 'badge-teal' : 'badge-coral'}`}
              data-testid="readiness-label"
            >
              {readiness.label} · {readiness.score}/100
            </span>
          </div>

          {readiness.pendingReviews > 0 && (
            <p style={{ fontSize: '.85rem', margin: '0 0 .5rem' }}>
              <Link href="/dashboard/updates" style={{ color: 'var(--coral)' }}>
                {readiness.pendingReviews} AI {readiness.pendingReviews === 1 ? 'suggestion' : 'suggestions'} waiting for
                your approval
              </Link>
              . Nothing there is live yet.
            </p>
          )}

          {readiness.missing.length === 0 ? (
            <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
              Everything is in place. This property is ready to share with guests.
            </p>
          ) : (
            <ul className="muted" style={{ fontSize: '.85rem', margin: 0, paddingLeft: '1.1rem' }} data-testid="readiness-missing">
              {readiness.missing.slice(0, 4).map((item) => (
                <li key={item.key} style={{ marginBottom: '.15rem' }}>
                  {item.label}
                  {item.required && <span style={{ color: 'var(--coral)' }}> (needed)</span>}
                </li>
              ))}
              {readiness.missing.length > 4 && (
                <li className="faint">and {readiness.missing.length - 4} more</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* View toggle: Graph (default, Obsidian-style) or the onboarding cards */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '.85rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2, rgba(255,255,255,.04))', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }} role="tablist" aria-label="Brain view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'graph'}
            className={`btn btn-sm ${view === 'graph' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}
            onClick={() => setView('graph')}
            data-testid="button-view-graph"
          >
            <Network size={15} /> Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'cards'}
            className={`btn btn-sm ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}
            onClick={() => setView('cards')}
            data-testid="button-view-cards"
          >
            <LayoutGrid size={15} /> Setup cards
          </button>
        </div>
        <span className="faint" style={{ fontSize: '.75rem' }}>
          {view === 'graph' ? 'Hover a node to see its section · tap to edit' : 'Track setup progress by section'}
        </span>
      </div>

      {view === 'graph' ? (
        <BrainGraph
          propertyId={propertyId}
          items={graphItems}
          categoryLabels={categoryLabels}
          canEdit={canEdit}
        />
      ) : (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}
          data-testid="brain-cards-grid"
        >
          {health.cards.map((card) => (
            <BuilderCard key={card.key} propertyId={propertyId} card={card} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuilderCard({ propertyId, card, canEdit }: { propertyId: string; card: CardHealth; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const color = scoreColor(card.pct);
  const href = `/dashboard/properties/${propertyId}/brain?card=${card.key}`;
  const image = CARD_IMAGES[card.key];
  const statusLabel = card.complete ? 'Complete' : card.recommendedComplete ? 'Recommended done' : 'In progress';

  return (
    <Link
      href={href}
      className="card bc-card"
      data-testid={`brain-card-${card.key}`}
      aria-label={`${card.title} — ${card.pct}% complete. ${canEdit ? 'Edit' : 'View'}`}
    >
      {/* Media header */}
      <div className="bc-media">
        {image && <img src={image} alt="" loading="lazy" />}
        {card.critical && (
          <span className="badge badge-coral bc-media-badge" style={{ fontSize: '.62rem' }}>critical</span>
        )}
      </div>

      <div className="bc-body">
        <div>
          <strong style={{ fontSize: '.95rem', display: 'block' }}>{card.title}</strong>
          <p className="faint bc-blurb" style={{ fontSize: '.75rem', marginTop: '.2rem' }}>{card.blurb}</p>
        </div>

        {/* Progress region (always rendered) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginBottom: '.25rem' }}>
            <span className="faint">{statusLabel}</span>
            <span style={{ color, fontWeight: 600 }} data-testid={`card-pct-${card.key}`}>{card.pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${card.pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
          </div>
        </div>

        {/* Footer — pinned to bottom, aligned across cards */}
        <div className="bc-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', paddingTop: '.2rem' }}>
          <span className="btn btn-sm btn-primary" data-testid={`button-open-card-${card.key}`}>
            {canEdit ? 'Edit' : 'View'}
          </span>
          {card.checklist.length > 0 && (
            <button
              type="button"
              className="bc-checklist-btn"
              style={{ fontSize: '.75rem' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              data-testid={`button-checklist-${card.key}`}
            >
              {open ? 'Hide checklist' : 'Checklist'}
            </button>
          )}
        </div>

        {open && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '.1rem 0 0', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {card.checklist.map((c, i) => (
              <li key={i} style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.78rem' }} data-testid={`checklist-${card.key}-${i}`}>
                <span aria-hidden style={{ color: c.done ? 'var(--teal)' : 'var(--text-faint)' }}>{c.done ? '✓' : '○'}</span>
                <span style={{ color: c.done ? 'var(--text)' : 'var(--text-faint)' }}>
                  {c.label}{!c.required && <span className="faint"> (optional)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div
      style={{
        width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`,
      }}
      data-testid="health-score-ring"
    >
      <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
        <strong style={{ fontSize: '1.4rem' }}>{score}</strong>
      </div>
    </div>
  );
}
