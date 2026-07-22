'use client';

// Persistent AI-disclosure surface for the guest concierge (EU AI Act Art. 50 —
// users must be clearly informed they are interacting with an AI system).
// Self-contained inline styles so it drops into the brand-scoped guest portal
// without depending on dashboard CSS.
//
// Two variants:
//   'banner' — prominent notice at the top of the chat panel.
//   'note'   — subtle one-liner shown near the message input.
//
// This does NOT replace the concierge's per-message emergency warning or the
// emergency routing in lib/guest/concierge.ts; it is an always-visible disclosure.

export function AiDisclosure({ variant = 'banner' }: { variant?: 'banner' | 'note' }) {
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
      role="note"
      data-testid="ai-disclosure-banner"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '.55rem',
        padding: '.6rem .8rem',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        fontSize: '.76rem',
        lineHeight: 1.45,
        marginBottom: '1rem',
      }}
    >
      <span aria-hidden style={{ fontSize: '.95rem', lineHeight: 1.3 }}>🤖</span>
      <span style={{ opacity: 0.8 }}>
        You’re chatting with an <strong>AI assistant</strong>, not a person. It answers
        from your host’s property information and can make mistakes. Don’t rely on it for
        emergency, medical, legal, or financial decisions — for emergencies, contact local
        services or your host first.
      </span>
    </div>
  );
}
