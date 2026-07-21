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

// Follow-up suggestions shown after the concierge answers, to keep guests exploring.
const FOLLOW_UPS = [
  'Best coffee nearby?',
  'Where should we eat dinner?',
  'Any good beaches or trails?',
  'How does the trash & recycling work?',
  'What time is quiet hours?',
  'Is there a grocery store close by?',
];

interface ChatEntry {
  role: 'guest' | 'assistant';
  content: string;
  escalated?: boolean;
  isEmergency?: boolean;
}

/** Moche.AI dome/bell mark — inlined so the brand-scoped portal needs no external CSS. */
function DomeMark({ size = 40 }: { size?: number }) {
  const gid = 'gpBrandGrad';
  return (
    <span aria-hidden style={{ width: size, height: size, display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 0 8px rgba(51,230,212,.4))' }}>
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size} role="img">
        <defs>
          <linearGradient id={gid} x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#33E6D4" />
            <stop offset="1" stopColor="#7C8CFF" />
          </linearGradient>
        </defs>
        <path d="M5 34h38" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 34a16 16 0 0 1 32 0" stroke={`url(#${gid})`} strokeWidth="2.4" fill="none" />
        <path d="M13 34a11 11 0 0 1 22 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.7" fill="none" />
        <path d="M18.5 34a5.5 5.5 0 0 1 11 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.55" fill="none" />
        <path d="M20.5 34v-4.2a3.5 3.5 0 0 1 7 0V34" fill="#33E6D4" opacity="0.9" />
        <circle cx="24" cy="12" r="2.4" fill="#FF8A5C" />
        <path d="M24 12v-4" stroke="#FF8A5C" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
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
      className="gp-root"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg, #070C14)',
        color: 'var(--text, #E9EEF5)',
        ['--brand-primary' as string]: primary,
        ['--brand-accent' as string]: accent,
      }}
    >
      {/* Ambient brand glow behind the content — depth without a heavy image. */}
      <div className="gp-aura" aria-hidden />

      <div style={{ position: 'relative', maxWidth: 620, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem 0 1.25rem' }}>
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" style={{ height: 44, width: 44, borderRadius: 12, objectFit: 'cover' }} />
          ) : (
            <DomeMark size={44} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.1 }}>{props.propertyName}</div>
            {props.location && <div style={{ fontSize: '.78rem', opacity: 0.6 }}>{props.location}</div>}
          </div>
          <span className="gp-brandchip">
            <DomeMark size={16} />
            <span>Moche<span style={{ color: accent }}>.AI</span></span>
          </span>
        </header>

        {!verified ? (
          <VerifyGate
            slug={props.slug}
            propertyName={props.propertyName}
            turnstileSiteKey={props.turnstileSiteKey}
            onVerified={(name) => { setVerified(true); setGuestName(name); }}
          />
        ) : (
          <Concierge slug={props.slug} propertyName={props.propertyName} guestName={guestName} accent={accent} />
        )}

        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', marginTop: '2.5rem', fontSize: '.72rem', opacity: 0.45 }}>
          <DomeMark size={14} />
          <span>Powered by Moche.AI · Your host verifies access. We never share your details.</span>
        </footer>
      </div>

      {/* Portal-scoped styles + motion. Standalone from dashboard CSS. */}
      <style jsx>{`
        .gp-aura {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(60% 40% at 50% -5%, rgba(51,230,212,.14), transparent 70%),
            radial-gradient(50% 40% at 100% 10%, rgba(124,140,255,.10), transparent 70%);
        }
        .gp-brandchip {
          display: inline-flex; align-items: center; gap: .3rem;
          font-size: .72rem; font-weight: 600; opacity: .7;
          padding: .28rem .55rem; border-radius: 999px;
          border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03);
          white-space: nowrap;
        }
        @media (max-width: 420px) { .gp-brandchip span:last-child { display: none; } }
      `}</style>
    </div>
  );
}

function VerifyGate({ slug, propertyName, turnstileSiteKey, onVerified }: { slug: string; propertyName: string; turnstileSiteKey: string; onVerified: (name: string | null) => void }) {
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
          // 'flexible' lets the widget shrink to the container width so it renders on
          // narrow mobile screens (fixed 300px widgets overflow small viewports and fail).
          size: 'flexible',
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
    <div style={cardStyle} className="gp-card gp-rise">
      <h1 style={{ fontSize: '1.5rem', marginBottom: '.4rem', letterSpacing: '-.01em' }}>
        Welcome{step === 'contact' ? ` to ${propertyName}` : ''}
      </h1>
      <p style={{ opacity: 0.72, fontSize: '.92rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
        Verify with the email or phone on your booking to unlock your personal concierge.
      </p>

      {/* Value teaser — why this beats a generic AI tab. */}
      {step === 'contact' && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {[
            { icon: '⚡', text: 'Instant answers' },
            { icon: '📍', text: 'Local gems' },
            { icon: '🛎️', text: '24/7 help' },
          ].map((b) => (
            <span key={b.text} style={teaserPill}><span aria-hidden>{b.icon}</span> {b.text}</span>
          ))}
        </div>
      )}

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
              <div ref={widgetContainer} style={{ margin: '1rem 0', minHeight: 65, width: '100%' }} data-testid="turnstile-widget" />
              {!widgetReady && (
                <div className="gp-shimmer" style={{ height: 44, borderRadius: 10, marginBottom: '.75rem' }} aria-label="Loading verification" />
              )}
            </>
          )}
          <button type="submit" style={btnStyle} className="gp-btn" disabled={busy} data-testid="button-send-code">{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <label style={labelStyle}>6-digit code</label>
          <input
            style={{ ...inputStyle, letterSpacing: '.4em', textAlign: 'center', fontSize: '1.4rem' }}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="000000" required data-testid="input-guest-code"
          />
          <button type="submit" style={btnStyle} className="gp-btn" disabled={busy || code.length !== 6} data-testid="button-verify-code">{busy ? 'Verifying…' : 'Verify'}</button>
          <button type="button" onClick={() => { setStep('contact'); setCode(''); setErr(null); }} style={linkBtn}>Use a different contact</button>
        </form>
      )}

      <style jsx>{`
        .gp-rise { animation: gpRise .5s cubic-bezier(.16,1,.3,1) both; }
        .gp-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 75%);
          background-size: 200% 100%; animation: gpShimmer 1.4s infinite;
        }
        @keyframes gpRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes gpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) {
          .gp-rise { animation: none; }
          .gp-shimmer { animation: none; }
        }
      `}</style>
    </div>
  );
}

function Concierge({ slug, propertyName, guestName, accent }: { slug: string; propertyName: string; guestName: string | null; accent: string }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    { role: 'assistant', content: `Hi${guestName ? ` ${guestName}` : ''}! I'm your concierge for ${propertyName}. Ask me anything about your stay — WiFi, check-out, the best spots nearby — or tap a shortcut below.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [entries, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setAsked(true);
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

  // Rotate a few follow-up suggestions once the guest has started chatting.
  const followUps = FOLLOW_UPS.slice(0, 3);

  return (
    <div className="gp-rise">
      {/* Presence banner — makes the concierge feel live and personal. */}
      <div style={presenceBar}>
        <DomeMark size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Your concierge</div>
          <div style={{ fontSize: '.74rem', opacity: 0.65, display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span className="gp-dot" /> Online · replies instantly
          </div>
        </div>
      </div>

      <div style={{ fontSize: '.74rem', opacity: 0.55, margin: '0 .15rem .5rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Quick shortcuts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem', marginBottom: '1rem' }}>
        {QUICK_ACTIONS.map((q) => (
          <button key={q.key} onClick={() => send(q.question)} disabled={busy} className="gp-chip" data-testid={`chip-${q.key}`}>
            <span aria-hidden style={{ fontSize: '1.15rem' }}>{q.emoji}</span>
            <span>{q.label}</span>
          </button>
        ))}
      </div>

      <div ref={scrollRef} style={{ ...cardStyle, maxHeight: '52dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.85rem', padding: '1.1rem' }}>
        {entries.map((m, i) => (
          <div key={i} className="gp-msg" style={{ display: 'flex', gap: '.5rem', alignSelf: m.role === 'guest' ? 'flex-end' : 'flex-start', maxWidth: '90%', flexDirection: m.role === 'guest' ? 'row-reverse' : 'row' }}>
            {m.role === 'assistant' && <span style={{ flexShrink: 0, marginTop: 2 }}><DomeMark size={26} /></span>}
            <div>
              <div style={m.role === 'guest' ? bubbleGuest : bubbleAssistant} data-testid={`msg-${m.role}-${i}`}>
                {m.isEmergency && <div style={{ fontWeight: 700, color: '#FF8A5C', marginBottom: '.25rem' }}>⚠ For emergencies, contact local services first.</div>}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
              {m.escalated && <div style={{ fontSize: '.72rem', opacity: 0.6, marginTop: '.25rem' }}>Sent to your host — they&apos;ll follow up.</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: '.5rem', alignSelf: 'flex-start' }}>
            <span style={{ flexShrink: 0, marginTop: 2 }}><DomeMark size={26} /></span>
            <div style={{ ...bubbleAssistant, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="gp-typing" /><span className="gp-typing" /><span className="gp-typing" />
            </div>
          </div>
        )}
      </div>

      {/* Follow-up suggestions — nudge the next question to keep them engaged. */}
      {asked && !busy && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
          {followUps.map((f) => (
            <button key={f} onClick={() => send(f)} className="gp-followup" data-testid="chip-followup">{f}</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
        <input
          style={{ ...inputStyle, marginBottom: 0 }} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your stay…" disabled={busy} data-testid="input-chat"
        />
        <button type="submit" className="gp-btn" style={{ ...btnStyle, width: 'auto', marginTop: 0, padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '.4rem' }} disabled={busy || !input.trim()} data-testid="button-send-chat">
          <span>Send</span><span aria-hidden>→</span>
        </button>
      </form>

      <style jsx>{`
        .gp-rise { animation: gpRise .5s cubic-bezier(.16,1,.3,1) both; }
        .gp-msg { animation: gpMsg .35s cubic-bezier(.16,1,.3,1) both; }
        .gp-dot {
          width: 7px; height: 7px; border-radius: 50%; background: ${accent};
          box-shadow: 0 0 0 0 ${accent}; animation: gpPulse 2s infinite;
        }
        .gp-chip {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3rem;
          padding: .7rem .4rem; border-radius: 14px; cursor: pointer;
          border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03);
          color: inherit; font-size: .78rem; font-weight: 600;
          transition: transform .18s cubic-bezier(.16,1,.3,1), border-color .18s, background .18s, box-shadow .18s;
        }
        .gp-chip:hover:not(:disabled) {
          transform: translateY(-2px); border-color: ${accent};
          background: rgba(255,255,255,.06); box-shadow: 0 10px 26px -14px ${accent};
        }
        .gp-chip:active:not(:disabled) { transform: translateY(0); }
        .gp-chip:disabled { opacity: .5; cursor: default; }
        .gp-followup {
          padding: .45rem .8rem; border-radius: 999px; cursor: pointer;
          border: 1px dashed rgba(255,255,255,.18); background: transparent; color: inherit;
          font-size: .78rem; transition: border-color .18s, background .18s, transform .18s;
        }
        .gp-followup:hover { border-color: ${accent}; background: rgba(255,255,255,.04); transform: translateY(-1px); }
        .gp-btn { transition: transform .18s cubic-bezier(.16,1,.3,1), filter .18s; }
        .gp-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
        .gp-btn:active:not(:disabled) { transform: translateY(0); }
        .gp-typing {
          width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .5;
          animation: gpBlink 1.2s infinite;
        }
        .gp-typing:nth-child(2) { animation-delay: .2s; }
        .gp-typing:nth-child(3) { animation-delay: .4s; }
        @keyframes gpRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes gpMsg { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes gpPulse { 0% { box-shadow: 0 0 0 0 ${accent}66; } 70% { box-shadow: 0 0 0 6px ${accent}00; } 100% { box-shadow: 0 0 0 0 ${accent}00; } }
        @keyframes gpBlink { 0%, 60%, 100% { opacity: .25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @media (prefers-reduced-motion: reduce) {
          .gp-rise, .gp-msg, .gp-dot, .gp-typing { animation: none; }
          .gp-chip:hover:not(:disabled), .gp-followup:hover, .gp-btn:hover:not(:disabled) { transform: none; }
        }
      `}</style>
    </div>
  );
}

// --- Inline styles (portal is brand-scoped, standalone from dashboard CSS) ---
const cardStyle: React.CSSProperties = { position: 'relative', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem', backdropFilter: 'blur(6px)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', opacity: 0.7, marginBottom: '.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.8rem .9rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', color: 'inherit', fontSize: '1rem', marginBottom: '1rem', outline: 'none' };
const btnStyle: React.CSSProperties = { width: '100%', padding: '.85rem', borderRadius: 12, border: 'none', background: 'var(--brand-accent, #33E6D4)', color: '#04121a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '.25rem' };
const linkBtn: React.CSSProperties = { width: '100%', background: 'none', border: 'none', color: 'inherit', opacity: 0.6, marginTop: '.75rem', cursor: 'pointer', fontSize: '.82rem' };
const teaserPill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .7rem', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontSize: '.78rem', fontWeight: 600 };
const presenceBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', marginBottom: '1rem' };
const bubbleGuest: React.CSSProperties = { background: 'linear-gradient(135deg, var(--brand-accent, #33E6D4), #7C8CFF)', color: '#04121a', padding: '.65rem .9rem', borderRadius: '16px 16px 4px 16px', fontSize: '.92rem', lineHeight: 1.45 };
const bubbleAssistant: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', padding: '.65rem .9rem', borderRadius: '16px 16px 16px 4px', fontSize: '.92rem', lineHeight: 1.45, color: 'inherit' };
const alertErr: React.CSSProperties = { background: 'rgba(255,138,92,0.12)', border: '1px solid rgba(255,138,92,0.4)', color: '#FF8A5C', padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
const alertOk: React.CSSProperties = { background: 'rgba(51,230,212,0.1)', border: '1px solid rgba(51,230,212,0.35)', color: '#33E6D4', padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
