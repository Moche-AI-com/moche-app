'use client';

import { useEffect, useRef, useState } from 'react';

type Phase = 'redeeming' | 'error';

export function StayRedeem(props: {
  slug: string;
  propertyName: string;
  brandAccent: string | null;
  logoUrl: string | null;
  token: string;
}) {
  const [phase, setPhase] = useState<Phase>('redeeming');
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
        // Either a session was set (kind=stay) or the guest must do OTP (kind=property /
        // require_otp). In both cases the portal at /g/{slug} shows the right next step:
        // verified → concierge; otherwise → verify gate with the property pre-resolved.
        window.location.replace(`/g/${props.slug}`);
      } catch {
        setPhase('error');
      }
    }
    void redeem();
  }, [props.slug, props.token]);

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
          <p style={{ opacity: 0.7, fontSize: '.9rem' }}>Unlocking your concierge…</p>
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
