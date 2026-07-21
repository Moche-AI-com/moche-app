'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CardBrainHealth, CardHealth } from '@/lib/brain/health';
import { PreviewChat } from './PreviewChat';

function scoreColor(pct: number): string {
  return pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--iris)' : 'var(--coral)';
}

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

  return (
    <div className="card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }} data-testid={`brain-card-${card.key}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', minWidth: 0 }}>
          <span aria-hidden style={{ fontSize: '1.4rem' }}>{card.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.95rem' }}>{card.title}</strong>
              {card.critical && <span className="badge badge-coral" style={{ fontSize: '.62rem' }}>critical</span>}
            </div>
            <p className="faint" style={{ fontSize: '.75rem', marginTop: '.1rem' }}>{card.blurb}</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginBottom: '.25rem' }}>
          <span className="faint">{card.complete ? 'Complete' : card.recommendedComplete ? 'Recommended done' : 'In progress'}</span>
          <span style={{ color, fontWeight: 600 }} data-testid={`card-pct-${card.key}`}>{card.pct}% complete</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${card.pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.1rem' }}>
        <Link href={href} className="btn btn-sm btn-primary" data-testid={`button-open-card-${card.key}`}>
          {canEdit ? 'Edit' : 'View'}
        </Link>
        {card.checklist.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen((v) => !v)} data-testid={`button-checklist-${card.key}`}>
            {open ? 'Hide checklist' : 'Checklist'}
          </button>
        )}
      </div>

      {open && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '.25rem 0 0', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
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
