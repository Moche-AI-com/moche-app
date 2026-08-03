'use client';

import { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

type Phase = 'redeeming' | 'error' | 'code' | 'submitting-code' | 'code-error';

export function StayRedeem(props: {
  slug: string;
  propertyName: string;
  brandAccent: string | null;
  logoUrl: string | null;
  token: string;
}) {
  const [phase, setPhase] = useState<Phase>('redeeming');
  const [code, setCode] = useState('');
  const ran = useRef(false);
  const accent = props.brandAccent || '#33E6D4';

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function redeem() {
      if (!props.token) {
        setPhase('error');
        return;
      }
      try {
        const res = await fetch(`/api/guest/${props.slug}/auth/redeem`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: props.token }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhase('error');
          return;
        }
        // Three outcomes: a session was already set (legacy stay link, no code) → go
        // straight in; the link needs its 4-digit visit code (WS-1, the default going
        // forward) → prompt here; or the guest must do OTP (kind=property) → the portal
        // at /g/{slug} shows the verify gate with the property pre-resolved.
        if (json?.requireCode) {
          setPhase('code');
          return;
        }
        window.location.replace(`/g/${props.slug}`);
      } catch {
        setPhase('error');
      }
    }
    void redeem();
  }, [props.slug, props.token]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setPhase('submitting-code');
    try {
      const res = await fetch(`/api/guest/${props.slug}/auth/code/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: props.token, code }),
      });
      if (!res.ok) {
        setPhase('code-error');
        return;
      }
      window.location.replace(`/g/${props.slug}`);
    } catch {
      setPhase('code-error');
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg, #070C14)',
        color: 'var(--text, #E9EEF5)',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logoUrl} alt="" style={{ height: 56, width: 56, borderRadius: 12, objectFit: 'cover', margin: '0 auto 1rem' }} />
        ) : (
          <div style={{ height: 56, width: 56, borderRadius: 12, background: accent, display: 'grid', placeItems: 'center', color: '#04121a', fontWeight: 700, margin: '0 auto 1rem', fontSize: '1.4rem' }}>
            {props.propertyName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ fontWeight: 600, fontSize: '1.15rem', marginBottom: '.5rem' }}>{props.propertyName}</div>

        {phase === 'redeeming' ? (
          <p style={{ opacity: 0.7, fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
            <Loader2 size={16} className="animate-spin" /> Unlocking your concierge…
          </p>
        ) : phase === 'code' || phase === 'submitting-code' || phase === 'code-error' ? (
          <form onSubmit={submitCode}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', color: accent, marginBottom: '.75rem' }}>
              <KeyRound size={18} />
              <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Enter your 4-digit visit code</span>
            </div>
            <p style={{ opacity: 0.65, fontSize: '.82rem', marginBottom: '1rem' }}>
              Your host sent this along with the link. It confirms you’re the guest for this stay.
            </p>
            <input
              autoFocus
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={phase === 'submitting-code'}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: '1.6rem',
                letterSpacing: '0.5rem',
                fontWeight: 700,
                padding: '.75rem',
                borderRadius: 10,
                border: `1px solid ${phase === 'code-error' ? '#ff6b6b' : 'rgba(255,255,255,0.18)'}`,
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                marginBottom: '.75rem',
              }}
            />
            {phase === 'code-error' && (
              <p style={{ color: '#ff8a8a', fontSize: '.82rem', marginBottom: '.75rem' }}>
                That code is invalid or has expired. Check with your host if this keeps happening.
              </p>
            )}
            <button
              type="submit"
              disabled={code.length !== 4 || phase === 'submitting-code'}
              style={{
                width: '100%',
                padding: '.75rem 1.25rem',
                borderRadius: 10,
                background: accent,
                color: '#04121a',
                fontWeight: 700,
                border: 'none',
                fontSize: '.9rem',
                opacity: code.length !== 4 ? 0.5 : 1,
                cursor: code.length !== 4 ? 'default' : 'pointer',
              }}
            >
              {phase === 'submitting-code' ? 'Checking\u2026' : 'Unlock concierge'}
            </button>
          </form>
        ) : (
          <div>
            <p style={{ opacity: 0.85, fontSize: '.9rem', marginBottom: '1rem' }}>
              That link is invalid or has expired.
            </p>
            <a
              href={`/g/${props.slug}`}
              style={{ display: 'inline-block', padding: '.75rem 1.25rem', borderRadius: 10, background: accent, color: '#04121a', fontWeight: 700, textDecoration: 'none', fontSize: '.9rem' }}
            >
              Verify with your booking
            </a>
          </div>
        )}

        <footer style={{ marginTop: '2.5rem', fontSize: '.72rem', opacity: 0.4 }}>Built in Somerville, MA</footer>
      </div>
    </div>
  );
}
