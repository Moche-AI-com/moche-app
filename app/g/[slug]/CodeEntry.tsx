'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const CODE_LENGTH = 4;

// Step 1 of the portal: each guest uses their own 4-digit stay guest ID. Returning
// guests confirm the phone number on their profile when they use a new device.
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
        body: JSON.stringify({ code, phone: needsPhone ? phone.trim() : undefined, accessToken: props.accessToken }),
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
      setError(json.error || 'That code does not match an active guest for this stay.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guest verification">
      <h2>Enter your guest ID</h2>
      <p className="muted">Use the 4-digit code your host shared for this stay.</p>
      <div style={{ display: 'flex', gap: '.55rem', justifyContent: 'center', margin: '1.25rem 0' }}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { inputsRef.current[index] = node; }}
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1}`}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
            style={{ width: 52, height: 58, textAlign: 'center', fontSize: '1.5rem', borderRadius: 14 }}
          />
        ))}
      </div>

      {needsPhone && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="guest-phone-confirm" style={{ display: 'block', fontWeight: 650, marginBottom: '.35rem' }}>
            Confirm your phone number
          </label>
          <input
            id="guest-phone-confirm"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Mobile number"
            style={{ width: '100%' }}
          />
          <p className="muted" style={{ fontSize: '.82rem' }}>This keeps your saved guest session attached to the right person on this device.</p>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={busy || code.length !== CODE_LENGTH || (needsPhone && !phone.trim())} style={{ width: '100%' }}>
        {busy ? 'Checking…' : needsPhone ? 'Confirm and continue' : 'Continue'}
      </button>
    </section>
  );
}
