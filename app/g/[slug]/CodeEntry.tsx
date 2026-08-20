'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const CODE_LENGTH = 4;

// Step 1 of the portal: 4-digit access code entry. Validates server-side against
// the property/reservation access code (see app/api/guest/[slug]/auth/code).
export function CodeEntry(props: {
  slug: string;
  accessToken: string | null;
  onVerified: (registered: boolean, guestName: string | null) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');

  async function submit(value: string) {
    if (busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/auth/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: value, token: props.accessToken ?? undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        props.onVerified(json.registered === true, typeof json.guestName === 'string' ? json.guestName : null);
        return;
      }
      setError(typeof json.error === 'string' ? json.error : 'The code entered is incorrect. Please try again.');
      setDigits(Array(CODE_LENGTH).fill(''));
      refs.current[0]?.focus();
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      // Auto-submit once the fourth digit lands.
      if (d && next.every((x) => x !== '')) void submit(next.join(''));
      return next;
    });
    if (d && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (text.length === 0) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('').map((_, i) => text[i] ?? '');
    setDigits(next);
    if (text.length === CODE_LENGTH) void submit(text);
    else refs.current[text.length]?.focus();
  }

  return (
    <section aria-label="Access code entry">
      <h1 className="gp-step-title">Welcome</h1>
      <p className="gp-step-sub">Enter your 4-digit access code. You&apos;ll find it on your welcome card or in the message from your host.</p>

      <div className="gp-code-row" role="group" aria-label="4-digit access code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className="gp-code-box"
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            value={d}
            disabled={busy}
            autoFocus={i === 0}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
          />
        ))}
      </div>

      {error ? <div className="gp-error" role="alert">{error}</div> : null}

      <button
        type="button"
        className="gp-btn gp-btn-primary"
        disabled={busy || code.length !== CODE_LENGTH}
        onClick={() => void submit(code)}
      >
        {busy ? 'Checking…' : 'Continue'}
      </button>

      <p className="gp-step-sub" style={{ marginTop: 16, fontSize: '0.82rem' }}>
        Trouble with your code? Contact your host directly.
      </p>
    </section>
  );
}
