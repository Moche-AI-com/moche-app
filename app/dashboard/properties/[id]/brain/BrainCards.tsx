'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CardBrainHealth, CardHealth } from '@/lib/brain/health';
import { PreviewChat } from './PreviewChat';

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
  health,
  canEdit,
}: {
  propertyId: string;
  propertyName: string;
  health: CardBrainHealth;
  canEdit: boolean;
}) {
  const [preview, setPreview] = useState(false);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <style dangerouslySetInnerHTML={{ __html: BUILDER_CARD_CSS }} />
      {/* Health hero */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }} data-testid="brain-health-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
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
          <button
            className="btn btn-primary"
            onClick={() => setPreview((v) => !v)}
            data-testid="button-preview-guest"
            style={{ alignSelf: 'flex-start' }}
          >
            {preview ? 'Close preview' : 'Preview as guest'}
          </button>
        </div>
      </div>

      {preview && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PreviewChat propertyId={propertyId} propertyName={propertyName} />
        </div>
      )}

      {/* Card grid */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}
        data-testid="brain-cards-grid"
      >
        {health.cards.map((card) => (
          <BuilderCard key={card.key} propertyId={propertyId} card={card} canEdit={canEdit} />
        ))}
      </div>
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
