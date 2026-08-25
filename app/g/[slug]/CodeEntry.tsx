'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const CODE_LENGTH = 4;

// Step 1 of the portal: one 4-digit stay code shared by the whole party. Once a
// guest is in, their session on this device is their saved account — they only
// re-enter the code (and their details) on a different browser. Legacy per-guest
// PINs minted before the merge still verify through the guest-code endpoint first.
export function CodeEntry(props: {
  slug: string;
  accessToken: string | null;
  onVerified: (registered: boolean, guestName: string | null) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [phone, setPhone] = useState('');
  const [needsPhone, setNeedsPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join('');

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((item, i) => (i === index ? digit : item)));
    if (digit && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) inputsRef.current[index - 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    setDigits(Array.from({ length: CODE_LENGTH }, (_, index) => pasted[index] ?? ''));
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function submit() {
    if (code.length !== CODE_LENGTH || busy || (needsPhone && !phone.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/auth/guest-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, phone: needsPhone ? phone.trim() : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.requiresPhoneConfirm === true) {
        setNeedsPhone(true);
        setError(null);
        return;
      }
      if (res.ok && json.ok) {
        props.onVerified(json.registered === true, typeof json.guestName === 'string' ? json.guestName : null);
        return;
      }

      // The shared stay code verifies through the original stay-link endpoint.
      // (Legacy order preserved: per-guest PINs win first so a PIN entry never
      // burns the link's attempt counter.)
      if (!needsPhone && res.status === 400) {
        const legacy = await fetch(`/api/guest/${props.slug}/auth/code`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, token: props.accessToken ?? undefined }),
        });
        const legacyJson = await legacy.json().catch(() => ({}));
        if (legacy.ok && legacyJson.ok) {
          props.onVerified(legacyJson.registered === true, typeof legacyJson.guestName === 'string' ? legacyJson.guestName : null);
          return;
        }
      }

      setError(json.error || 'That code does not match this stay. Check with your host and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guest verification">
      <h2 className="gp-step-title">Enter your stay code</h2>
      <p className="gp-step-sub">The 4-digit code your host shared for this stay — everyone in your party uses the same one.</p>
      <div className="gp-code-row">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { inputsRef.current[index] = node; }}
            className="gp-code-box"
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1}`}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
          />
        ))}
      </div>

      {needsPhone && (
        <div className="gp-field" style={{ marginTop: '1rem' }}>
          <label htmlFor="guest-phone-confirm" className="gp-label">
            Confirm your phone number
          </label>
          <input
            id="guest-phone-confirm"
            className="gp-input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Mobile number"
          />
          <p className="gp-muted" style={{ fontSize: '.82rem', marginTop: 6 }}>This keeps your saved guest session attached to the right person on this device.</p>
        </div>
      )}

      {error && <div className="gp-error" role="alert">{error}</div>}
      <button
        type="button"
        className="gp-btn gp-btn-primary"
        onClick={() => void submit()}
        disabled={busy || code.length !== CODE_LENGTH || (needsPhone && !phone.trim())}
      >
        {busy ? 'Checking…' : needsPhone ? 'Confirm and continue' : 'Continue'}
      </button>
    </section>
  );
}
