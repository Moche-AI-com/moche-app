'use client';

import { useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';

// Persistent AI-disclosure surface for the guest concierge (EU AI Act Art. 50 —
// users must be clearly informed they are interacting with an AI system).
// Self-contained inline styles so it drops into the brand-scoped guest portal
// without depending on dashboard CSS.
//
// Design: a single compact, always-visible line (icon + short statement) sits near
// the chat input. Tapping/clicking it (or its chevron) expands a "How this works"
// detail with the fuller compliance text. The line itself is never hidden and never
// relies on hover — it is a real, focusable <button> with visible text, so the
// disclosure is reachable and readable without hunting even before it's expanded.
//
// Two variants:
//   'banner' — kept for compatibility; now renders the same compact+expandable
//              disclosure (previously a large always-open block).
//   'note'   — a subtle one-liner shown near the message input (unchanged copy).
//
// This does NOT replace the concierge's per-message emergency warning or the
// emergency routing in lib/guest/concierge.ts; it is an always-visible disclosure.

export function AiDisclosure({ variant = 'banner' }: { variant?: 'banner' | 'note' }) {
  const [open, setOpen] = useState(false);

  if (variant === 'note') {
    return (
      <p
        data-testid="ai-disclosure-note"
        style={{
          margin: '.4rem .15rem 0',
          fontSize: '.68rem',
          lineHeight: 1.4,
          opacity: 0.55,
          textAlign: 'center',
        }}
      >
        Answers are AI-generated and may be imperfect. For emergencies, contact local
        services or your host directly.
      </p>
    );
  }

  return (
    <div
      data-testid="ai-disclosure-banner"
      style={{
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        fontSize: '.76rem',
        lineHeight: 1.45,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ai-disclosure-details"
        data-testid="button-ai-disclosure-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.5rem',
          width: '100%',
          // Keep the toggle at the 44px minimum touch target; the compact text
          // alone computes to roughly 33px.
          minHeight: 44,
          padding: '.55rem .7rem',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          fontSize: '.74rem',
        }}
      >
        <Bot aria-hidden size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
        <span style={{ opacity: 0.8, flex: 1, minWidth: 0 }}>
          You&rsquo;re chatting with an <strong>AI assistant</strong>, not a person.
        </span>
        <ChevronDown
          aria-hidden
          size={15}
          style={{
            flexShrink: 0,
            opacity: 0.6,
            transition: 'transform .18s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>
      {open && (
        <div
          id="ai-disclosure-details"
          role="note"
          data-testid="ai-disclosure-details"
          style={{
            padding: '0 .7rem .65rem',
            opacity: 0.8,
          }}
        >
          It answers from your host&rsquo;s property information and can make
          mistakes. Don&rsquo;t rely on it for emergency, medical, legal, or
          financial decisions. For emergencies, contact local services or your
          host first.
        </div>
      )}
    </div>
  );
}
