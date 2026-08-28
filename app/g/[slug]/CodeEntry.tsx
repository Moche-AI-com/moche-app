'use client';

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { KeyRound } from 'lucide-react';
import type { PortalT } from '@/lib/guest/portal-strings';

const CODE_LENGTH = 4;

// Step 1 of the portal — the guest's first impression. The shared 4-digit party
// code auto-submits on the fourth digit; a rejected code shakes, keeps the
// digits, and re-arms the moment any digit is edited. Every device that clears
// this step gets its own session and then identifies itself ("Who's
// joining?"), so each member of the party ends up with their own concierge —
// the code only ever proves you're WITH the party, never WHO you are. Legacy
// per-guest PINs minted before the merge still verify through the guest-code
// endpoint first, then the legacy stay-link endpoint.
//
// Demo mode (host preview sign-in walkthrough): any code advances, nothing is
// verified against the server and nothing is saved.
export function CodeEntry(props: {
  slug: string;
  accessToken: string | null;
  propertyName: string;
  t: PortalT;
  demo?: boolean;
  onVerified: (registered: boolean, guestName: string | null) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const lastSubmitted = useRef<string | null>(null);
  const code = digits.join('');
  const { t } = props;

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setError(null);
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
    setError(null);
    setDigits(Array.from({ length: CODE_LENGTH }, (_, index) => pasted[index] ?? ''));
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  const submit = useCallback(async () => {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Demo mode: the UX of a successful verify with zero network traffic.
      if (props.demo) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        props.onVerified(false, null);
        return;
      }
      const res = await fetch(`/api/guest/${props.slug}/auth/guest-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        props.onVerified(json.registered === true, typeof json.guestName === 'string' ? json.guestName : null);
        return;
      }

      // Legacy fallback: per-guest PINs and token-link codes minted before the
      // party-code merge verify through the original stay-link endpoint.
      if (res.status === 400) {
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

      setError(t('codeError'));
      setShakeKey((current) => current + 1);
    } finally {
      setBusy(false);
    }
  }, [code, busy, props, t]);

  // Auto-submit as soon as the fourth digit lands. A rejected code re-arms the
  // moment the guest edits any digit (the code no longer matches lastSubmitted),
  // so there is no stuck state and no extra tap needed.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !busy && lastSubmitted.current !== code) {
      lastSubmitted.current = code;
      void submit();
    }
  }, [code, busy, submit]);

  return (
    <section aria-label="Guest verification">
      <div className="gp-kicker">
        <KeyRound size={13} aria-hidden /> {t('codeKicker')}
      </div>
      <h2 className="gp-step-title">{t('codeTitle', { property: props.propertyName })}</h2>
      <p className="gp-step-sub">{t('codeSub')}</p>
      <div className={shakeKey > 0 ? 'gp-code-row gp-shake' : 'gp-code-row'} key={shakeKey}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { inputsRef.current[index] = node; }}
            className="gp-code-box"
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            autoFocus={index === 0}
            aria-label={`Digit ${index + 1}`}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
          />
        ))}
      </div>
      <p className="gp-code-hint">{props.demo ? t('demoSigninHint') : t('codeHint')}</p>

      {error && <div className="gp-error" role="alert">{error}</div>}
      <button
        type="button"
        className="gp-btn gp-btn-primary"
        onClick={() => {
          lastSubmitted.current = code;
          void submit();
        }}
        disabled={busy || code.length !== CODE_LENGTH}
      >
        {busy ? t('checking') : t('continue')}
      </button>
    </section>
  );
}
