'use client';

import { useState, useRef, useEffect } from 'react';
import { GUEST_QUICK_ACTIONS } from '@/lib/constants';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  escalated?: boolean;
  isEmergency?: boolean;
  confidence?: number;
}

// Host-facing preview of the guest concierge. Hits the read-only host preview
// endpoint (no guest session, no persistence). Mirrors the guest chat UX so the
// host sees exactly what a verified guest would get.
export function PreviewChat({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    { role: 'assistant', content: `Preview mode — this is exactly what a verified guest sees when chatting with the ${propertyName} concierge. Ask anything or tap a shortcut.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...entries, { role: 'user' as const, content: text }];
    setEntries(next);
    setInput('');
    setBusy(true);
    try {
      const history = next
        .filter((e) => e.role === 'user' || e.role === 'assistant')
        .slice(-12)
        .map((e) => ({ role: e.role, content: e.content }));
      const res = await fetch(`/api/host/properties/${propertyId}/preview-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Preview could not answer just now.');
      setEntries((e) => [...e, { role: 'assistant', content: json.answer, escalated: json.escalated, isEmergency: json.isEmergency, confidence: json.confidence }]);
    } catch (e) {
      setEntries((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }} data-testid="preview-chat">
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.85rem' }}>
        {GUEST_QUICK_ACTIONS.map((q) => (
          <button
            key={q.key}
            onClick={() => send(q.question)}
            disabled={busy}
            className="btn btn-sm btn-ghost"
            style={{ borderRadius: 999 }}
            data-testid={`preview-chip-${q.key}`}
          >
            <span aria-hidden>{q.emoji}</span> {q.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        style={{ maxHeight: '48dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem', padding: '.25rem' }}
        data-testid="preview-messages"
      >
        {entries.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={m.role === 'user' ? bubbleUser : bubbleAssistant} data-testid={`preview-msg-${m.role}-${i}`}>
              {m.isEmergency && <div style={{ fontWeight: 700, color: 'var(--coral)', marginBottom: '.25rem' }}>⚠ For emergencies, contact local services first.</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
            {m.role === 'assistant' && m.confidence !== undefined && (
              <div className="faint" style={{ fontSize: '.68rem', marginTop: '.2rem' }}>
                confidence {Math.round(m.confidence * 100)}%{m.escalated ? ' · would escalate to host' : ''}
              </div>
            )}
          </div>
        ))}
        {busy && <div style={{ ...bubbleAssistant, alignSelf: 'flex-start', opacity: 0.6 }}>Thinking…</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
        <input
          className="input"
          style={{ marginBottom: 0 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask as a guest would…"
          disabled={busy}
          data-testid="preview-input"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} data-testid="preview-send">Send</button>
      </form>
    </div>
  );
}

const bubbleUser: React.CSSProperties = { background: 'var(--brand-accent, var(--teal))', color: '#04121a', padding: '.55rem .8rem', borderRadius: '14px 14px 4px 14px', fontSize: '.88rem' };
const bubbleAssistant: React.CSSProperties = { background: 'var(--card-2, rgba(255,255,255,0.06))', padding: '.55rem .8rem', borderRadius: '14px 14px 14px 4px', fontSize: '.88rem' };
