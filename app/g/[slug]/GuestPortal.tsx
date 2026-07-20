'use client';

import { useState, useRef, useEffect } from 'react';

const QUICK_ACTIONS = [
  { key: 'wifi', label: 'WiFi', question: 'What is the WiFi network and password?', emoji: '📶' },
  { key: 'checkin', label: 'Check-in', question: 'What is the check-in process and time?', emoji: '🔑' },
  { key: 'checkout', label: 'Check-out', question: 'What is the check-out process and time?', emoji: '🧳' },
  { key: 'parking', label: 'Parking', question: 'Where can I park?', emoji: '🅿️' },
  { key: 'rules', label: 'House Rules', question: 'What are the house rules?', emoji: '📋' },
  { key: 'local', label: 'Local Tips', question: 'What do you recommend nearby?', emoji: '📍' },
];

interface ChatEntry {
  role: 'guest' | 'assistant';
  content: string;
  escalated?: boolean;
  isEmergency?: boolean;
}

export function GuestPortal(props: {
  slug: string;
  propertyName: string;
  location: string;
  brandPrimary: string | null;
  brandAccent: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  turnstileSiteKey: string;
  initialVerified: boolean;
  guestName: string | null;
}) {
  const [verified, setVerified] = useState(props.initialVerified);
  const [guestName, setGuestName] = useState(props.guestName);

  const primary = props.brandPrimary || '#12B5AD';
  const accent = props.brandAccent || '#33E6D4';

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg, #070C14)',
        color: 'var(--text, #E9EEF5)',
        // Brand overrides scoped to the portal.
        ['--brand-primary' as string]: primary,
        ['--brand-accent' as string]: accent,
      }}
    >
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem 0 1.25rem' }}>
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" style={{ height: 40, width: 40, borderRadius: 10, objectFit: 'cover' }} />
          ) : (
            <div style={{ height: 40, width: 40, borderRadius: 10, background: accent, display: 'grid', placeItems: 'center', color: '#04121a', fontWeight: 700 }}>
              {props.propertyName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{props.propertyName}</div>
            {props.location && <div style={{ fontSize: '.78rem', opacity: 0.6 }}>{props.location}</div>}
          </div>
        </header>

        {!verified ? (
          <VerifyGate
            slug={props.slug}
            turnstileSiteKey={props.turnstileSiteKey}
            onVerified={(name) => { setVerified(true); setGuestName(name); }}
          />
        ) : (
          <Concierge slug={props.slug} propertyName={props.propertyName} guestName={guestName} />
        )}

        <footer style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '.72rem', opacity: 0.4 }}>
          Powered by Moche.AI · Your host verifies access. We never share your details.
        </footer>
      </div>
    </div>
  );
}

function VerifyGate({ slug, turnstileSiteKey, onVerified }: { slug: string; turnstileSiteKey: string; onVerified: (name: string | null) => void }) {
  const [step, setStep] = useState<'contact' | 'code'>('contact');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const turnstileToken = useRef<string>('');
  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  // Load Turnstile via EXPLICIT rendering. Implicit auto-render is unreliable when the
  // script is injected after React mounts the container (the widget iframe silently fails
  // to appear). Explicit render() guarantees the widget mounts and the token callback wires.
  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;

    type TS = {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
    const getTS = () => (window as unknown as { turnstile?: TS }).turnstile;

    function renderWidget() {
      const ts = getTS();
      if (cancelled || !ts || !widgetContainer.current || widgetId.current) return;
      try {
        widgetId.current = ts.render(widgetContainer.current, {
          sitekey: turnstileSiteKey,
          callback: (t: string) => { turnstileToken.current = t; },
          'expired-callback': () => { turnstileToken.current = ''; },
          'error-callback': () => { turnstileToken.current = ''; },
        });
        setWidgetReady(true);
      } catch {
        /* render will be retried by the load handler */
      }
    }

    // If the script is already present/loaded, render immediately; otherwise inject it.
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (getTS()) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener('load', renderWidget, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '1');
      s.addEventListener('load', renderWidget, { once: true });
      document.head.appendChild(s);
    }
    // Safety poll in case the load event fired before the listener attached.
    const poll = setInterval(() => { if (getTS()) { renderWidget(); if (widgetId.current) clearInterval(poll); } }, 300);

    return () => {
      cancelled = true;
      clearInterval(poll);
      const ts = getTS();
      if (ts && widgetId.current) { try { ts.remove(widgetId.current); } catch { /* noop */ } }
      widgetId.current = null;
    };
  }, [turnstileSiteKey]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    // If Turnstile is configured but hasn't produced a token yet, guide the guest
    // instead of firing a request the server will reject with the generic bot error.
    if (turnstileSiteKey && !turnstileToken.current) {
      setErr('Please complete the verification checkbox above, then tap Send code.');
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/guest/${slug}/verify/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact, turnstileToken: turnstileToken.current || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setMsg(json.message ?? "If that contact matches a booking, we've sent a code.");
      setStep('code');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/guest/${slug}/verify/confirm`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'That code is invalid or has expired.');
      onVerified(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That code is invalid or has expired.');
    } finally { setBusy(false); }
  }

  return (
    <div style={cardStyle}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '.4rem' }}>Welcome</h1>
      <p style={{ opacity: 0.7, fontSize: '.9rem', marginBottom: '1.25rem' }}>
        Verify with the email or phone on your booking to unlock your concierge, WiFi, check-in details, and more.
      </p>

      {err && <div style={alertErr}>{err}</div>}
      {msg && step === 'code' && <div style={alertOk}>{msg}</div>}

      {step === 'contact' ? (
        <form onSubmit={start}>
          <label style={labelStyle}>Email or phone</label>
          <input
            style={inputStyle} value={contact} onChange={(e) => setContact(e.target.value)}
            placeholder="you@email.com or +1 555 000 0000" autoComplete="off" required data-testid="input-guest-contact"
          />
          {turnstileSiteKey && (
            <>
              <div ref={widgetContainer} style={{ margin: '1rem 0', minHeight: 65 }} data-testid="turnstile-widget" />
              {!widgetReady && <p style={{ opacity: 0.6, fontSize: '.75rem', marginBottom: '.75rem' }}>Loading verification…</p>}
            </>
          )}
          <button type="submit" style={btnStyle} disabled={busy} data-testid="button-send-code">{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <label style={labelStyle}>6-digit code</label>
          <input
            style={{ ...inputStyle, letterSpacing: '.4em', textAlign: 'center', fontSize: '1.4rem' }}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="000000" required data-testid="input-guest-code"
          />
          <button type="submit" style={btnStyle} disabled={busy || code.length !== 6} data-testid="button-verify-code">{busy ? 'Verifying…' : 'Verify'}</button>
          <button type="button" onClick={() => { setStep('contact'); setCode(''); setErr(null); }} style={linkBtn}>Use a different contact</button>
        </form>
      )}
    </div>
  );
}

function Concierge({ slug, propertyName, guestName }: { slug: string; propertyName: string; guestName: string | null }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    { role: 'assistant', content: `Hi${guestName ? ` ${guestName}` : ''}! I'm your concierge for ${propertyName}. Ask me anything, or tap a shortcut below.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [entries, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setEntries((e) => [...e, { role: 'guest', content: text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`/api/guest/${slug}/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'I could not answer just now.');
      setEntries((e) => [...e, { role: 'assistant', content: json.answer, escalated: json.escalated, isEmergency: json.isEmergency }]);
    } catch (e) {
      setEntries((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.' }]);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {QUICK_ACTIONS.map((q) => (
          <button key={q.key} onClick={() => send(q.question)} disabled={busy} style={chipStyle} data-testid={`chip-${q.key}`}>
            <span aria-hidden>{q.emoji}</span> {q.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} style={{ ...cardStyle, maxHeight: '55dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {entries.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'guest' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={m.role === 'guest' ? bubbleGuest : bubbleAssistant} data-testid={`msg-${m.role}-${i}`}>
              {m.isEmergency && <div style={{ fontWeight: 700, color: '#FF8A5C', marginBottom: '.25rem' }}>⚠ For emergencies, contact local services first.</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
            {m.escalated && <div style={{ fontSize: '.72rem', opacity: 0.6, marginTop: '.25rem' }}>Sent to your host — they&apos;ll follow up.</div>}
          </div>
        ))}
        {busy && <div style={{ ...bubbleAssistant, alignSelf: 'flex-start', opacity: 0.6 }}>Thinking…</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
        <input
          style={{ ...inputStyle, marginBottom: 0 }} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your stay…" disabled={busy} data-testid="input-chat"
        />
        <button type="submit" style={{ ...btnStyle, width: 'auto', marginTop: 0, padding: '0 1.25rem' }} disabled={busy || !input.trim()} data-testid="button-send-chat">Send</button>
      </form>
    </div>
  );
}

// --- Inline styles (portal is brand-scoped, standalone from dashboard CSS) ---
const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.5rem' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', opacity: 0.7, marginBottom: '.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.75rem .9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', color: 'inherit', fontSize: '1rem', marginBottom: '1rem' };
const btnStyle: React.CSSProperties = { width: '100%', padding: '.8rem', borderRadius: 10, border: 'none', background: 'var(--brand-accent, #33E6D4)', color: '#04121a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '.25rem' };
const linkBtn: React.CSSProperties = { width: '100%', background: 'none', border: 'none', color: 'inherit', opacity: 0.6, marginTop: '.75rem', cursor: 'pointer', fontSize: '.82rem' };
const chipStyle: React.CSSProperties = { padding: '.5rem .8rem', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', color: 'inherit', fontSize: '.82rem', cursor: 'pointer' };
const bubbleGuest: React.CSSProperties = { background: 'var(--brand-accent, #33E6D4)', color: '#04121a', padding: '.6rem .85rem', borderRadius: '14px 14px 4px 14px', fontSize: '.9rem' };
const bubbleAssistant: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', padding: '.6rem .85rem', borderRadius: '14px 14px 14px 4px', fontSize: '.9rem' };
const alertErr: React.CSSProperties = { background: 'rgba(255,138,92,0.12)', border: '1px solid rgba(255,138,92,0.4)', color: '#FF8A5C', padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
const alertOk: React.CSSProperties = { background: 'rgba(51,230,212,0.1)', border: '1px solid rgba(51,230,212,0.35)', color: '#33E6D4', padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
