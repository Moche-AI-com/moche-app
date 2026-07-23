'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  UtensilsCrossed, Compass, KeyRound, Sparkles, Wifi, Star, MessageCircle,
  ConciergeBell, X, ArrowRight, Volume2, VolumeX, Zap, MapPin, Eye,
  AlertTriangle, ExternalLink, Check, Plus, UserRound, Send, type LucideIcon,
} from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { PremiumImage } from '@/components/PremiumImage';

// Luxury concierge palette (per Feature 3 brief). Fixed dark base + gold accent so the
// portal reads as a high-end hotel experience regardless of per-property brand colors.
const GOLD = '#c9a96e';
const BG = '#0d0f14';

// Sentinel query: a sub-choice that should just focus the free-text input rather than
// fire a pre-formed question (keeps a "type your own" escape hatch inside the card UX).
const FOCUS_INPUT = '__FOCUS_INPUT__';

// Sentinel query: a sub-choice that opens the "Message the host" composer so the guest
// can type their own issue, which is sent to the host as a manual escalation (rather
// than firing a canned question at the AI concierge).
const MESSAGE_HOST = '__MESSAGE_HOST__';

interface SubChoice { label: string; query: string }
interface Category { key: string; label: string; Icon: LucideIcon; subtitle: string; choices: SubChoice[] }

// Choice-driven categories (zero-typing UX). Each opens a sub-choice screen whose taps
// fire a pre-formed natural-language query at the existing concierge chat API.
const CATEGORIES: Category[] = [
  {
    key: 'dining', label: 'Dining', Icon: UtensilsCrossed, subtitle: 'Where to eat & drink',
    choices: [
      { label: 'Casual Dining', query: 'What are the best casual dining spots nearby?' },
      { label: 'Fine Dining', query: 'Can you recommend upscale or fine dining restaurants nearby?' },
      { label: 'Coffee', query: 'Where can I get great coffee nearby?' },
      { label: 'Drinks', query: 'What are good bars or places for a drink nearby?' },
      { label: 'Takeout', query: 'What are good takeout or delivery options nearby?' },
      { label: 'Grocery', query: 'Where is the nearest grocery store?' },
    ],
  },
  {
    key: 'local', label: 'Local Guide', Icon: Compass, subtitle: 'Explore the area',
    choices: [
      { label: 'Top Attractions', query: 'What are the top attractions and things to do nearby?' },
      { label: 'Nature & Outdoors', query: 'Are there good beaches, parks, or trails nearby?' },
      { label: 'Family Friendly', query: 'What are some family-friendly activities nearby?' },
      { label: 'Nightlife', query: 'What is the nightlife like around here?' },
      { label: 'Hidden Gems', query: "What are some local hidden gems most visitors don't know about?" },
      { label: 'Getting Around', query: 'How do I get around the area — transit, taxis, or rideshare?' },
    ],
  },
  {
    key: 'checkinout', label: 'Check-In / Out', Icon: KeyRound, subtitle: 'Arrival & departure',
    choices: [
      { label: 'Check-In Time', query: 'What is the check-in time and process?' },
      { label: 'Check-Out Time', query: 'What is the check-out time and process?' },
      { label: 'Access / Door Code', query: 'How do I access the property — door code or lockbox?' },
      { label: 'Early Arrival', query: 'Is early check-in or luggage drop-off possible?' },
      { label: 'Late Checkout', query: 'Is a late check-out possible?' },
    ],
  },
  {
    key: 'housekeeping', label: 'Housekeeping', Icon: Sparkles, subtitle: 'Comfort & supplies',
    choices: [
      { label: 'Fresh Towels', query: 'Could I get fresh towels?' },
      { label: 'Toiletries', query: 'Where can I find extra toiletries and essentials?' },
      { label: 'Trash & Recycling', query: 'How does the trash and recycling work?' },
      { label: 'Cleaning Request', query: 'Can I request a mid-stay cleaning?' },
      { label: 'Laundry', query: 'Is there a washer, dryer, or laundry service?' },
    ],
  },
  {
    key: 'wifi', label: 'WiFi & Info', Icon: Wifi, subtitle: 'House essentials',
    choices: [
      { label: 'WiFi Password', query: 'What is the WiFi network name and password?' },
      { label: 'House Rules', query: 'What are the house rules?' },
      { label: 'Parking', query: 'Where can I park?' },
      { label: 'Appliances', query: 'How do I use the appliances — TV, thermostat, coffee maker?' },
      { label: 'Emergency Info', query: 'What should I do in an emergency, and who do I contact?' },
    ],
  },
  {
    key: 'favorites', label: 'Favorites', Icon: Star, subtitle: "Host's top picks",
    choices: [
      { label: "Host's Top Picks", query: "What are the host's personal favorite recommendations nearby?" },
      { label: 'Best Restaurants', query: 'Which restaurants does the host recommend most?' },
      { label: 'Must-See Spots', query: 'What are the must-see spots the host recommends?' },
      { label: 'Local Favorites', query: 'What local favorites should I not miss?' },
    ],
  },
  {
    key: 'ask', label: 'Ask Anything', Icon: MessageCircle, subtitle: 'Your own question',
    choices: [
      { label: 'What can you help with?', query: 'What can you help me with during my stay?' },
      { label: 'Plan my evening', query: 'Can you suggest a plan for my evening nearby?' },
      { label: 'Type my own question', query: FOCUS_INPUT },
    ],
  },
  {
    key: 'request', label: 'Request', Icon: ConciergeBell, subtitle: 'Ask the host for help',
    choices: [
      { label: 'Report an Issue', query: 'I need to report an issue with the property.' },
      { label: 'Request Supplies', query: 'Could I request some extra supplies?' },
      { label: 'Maintenance Help', query: 'Something needs maintenance — can you help?' },
      { label: 'Message the Host', query: MESSAGE_HOST },
      { label: 'Something Else', query: FOCUS_INPUT },
    ],
  },
];

interface ChatEntry {
  role: 'guest' | 'assistant' | 'host';
  content: string;
  escalated?: boolean;
  isEmergency?: boolean;
}

export interface ReviewNudgeConfig { enabled: boolean; auto: boolean; url: string | null }
export interface UpsellOffer {
  id: string;
  title: string;
  description: string | null;
  price_text: string | null;
  cta_label: string | null;
}

/** Moche.AI dome/bell mark — inlined so the brand-scoped portal needs no external CSS. */
function DomeMark({ size = 40 }: { size?: number }) {
  const gid = 'gpBrandGrad';
  return (
    <span aria-hidden style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size} role="img">
        <defs>
          <linearGradient id={gid} x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor={GOLD} />
            <stop offset="1" stopColor="#e7d3a6" />
          </linearGradient>
        </defs>
        <path d="M5 34h38" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 34a16 16 0 0 1 32 0" stroke={`url(#${gid})`} strokeWidth="2.4" fill="none" />
        <path d="M13 34a11 11 0 0 1 22 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.7" fill="none" />
        <path d="M18.5 34a5.5 5.5 0 0 1 11 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.55" fill="none" />
        <path d="M20.5 34v-4.2a3.5 3.5 0 0 1 7 0V34" fill={GOLD} opacity="0.9" />
        <circle cx="24" cy="12" r="2.4" fill={GOLD} />
        <path d="M24 12v-4" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function GuestPortal(props: {
  fontClassName: string;
  slug: string;
  propertyId: string;
  propertyName: string;
  location: string;
  brandPrimary: string | null;
  brandAccent: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  turnstileSiteKey: string;
  initialVerified: boolean;
  hostPreview: boolean;
  guestName: string | null;
  reviewNudge: ReviewNudgeConfig;
  upsellOffers: UpsellOffer[];
}) {
  const [verified, setVerified] = useState(props.initialVerified);
  const [guestName, setGuestName] = useState(props.guestName);

  return (
    <div
      className={`gp-root ${props.fontClassName}`}
      style={{
        minHeight: '100dvh',
        background: BG,
        color: '#ece7dd',
        fontFamily: 'var(--font-portal-sans), system-ui, sans-serif',
        ['--gp-gold' as string]: GOLD,
      }}
    >
      {/* Full-screen property-photo hero with a bottom-to-top dark gradient for legibility. */}
      <section className="gp-hero" data-testid="portal-hero">
        <div
          className="gp-hero-bg"
          style={props.coverImageUrl ? { backgroundImage: `url(${props.coverImageUrl})` } : undefined}
          aria-hidden
        />
        <div className="gp-hero-scrim" aria-hidden />
        <div className="gp-hero-inner">
          <header className="gp-hero-top">
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="" style={{ height: 40, width: 40, borderRadius: 10, objectFit: 'cover' }} />
            ) : (
              <DomeMark size={40} />
            )}
            <span className="gp-brandchip">
              <DomeMark size={15} />
              <span>Moche<span style={{ color: GOLD }}>.AI</span></span>
            </span>
          </header>
          <div className="gp-hero-title">
            <div className="gp-eyebrow">Your Private Concierge</div>
            <h1 className="gp-serif" data-testid="portal-property-name">{props.propertyName}</h1>
            {props.location && (
              <div className="gp-hero-loc"><MapPin size={14} aria-hidden /> {props.location}</div>
            )}
          </div>
        </div>
      </section>

      <div className="gp-container">
        {props.hostPreview && (
          <div style={hostPreviewBar} data-testid="banner-host-preview">
            <Eye size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Host preview — you&apos;re seeing exactly what a verified guest sees. Nothing here is saved as a guest conversation.</span>
          </div>
        )}

        {!verified ? (
          <VerifyGate
            slug={props.slug}
            propertyName={props.propertyName}
            turnstileSiteKey={props.turnstileSiteKey}
            onVerified={(name) => { setVerified(true); setGuestName(name); }}
          />
        ) : (
          <Concierge
            slug={props.slug}
            propertyId={props.propertyId}
            hostPreview={props.hostPreview}
            propertyName={props.propertyName}
            guestName={guestName}
            reviewNudge={props.reviewNudge}
            upsellOffers={props.upsellOffers}
          />
        )}

        <footer className="gp-footer">
          <DomeMark size={14} />
          <span>Powered by Moche.AI · Your host verifies access. We never share your details.</span>
        </footer>
      </div>

      {/* Portal-scoped styles + motion. Standalone from dashboard CSS. */}
      <style jsx global>{`
        .gp-serif { font-family: var(--font-portal-serif), Georgia, serif; }
        .gp-hero { position: relative; min-height: 58dvh; display: flex; overflow: hidden; }
        .gp-hero-bg {
          position: absolute; inset: 0; background-size: cover; background-position: center;
          background-color: #14171f;
          /* No property cover photo? Fall back to a premium villa hero under a gold tint.
             If /premium/portal-hero.jpg is ever absent, the gradient + solid color still render. */
          background-image:
            radial-gradient(120% 90% at 50% 0%, rgba(201,169,110,.16), transparent 60%),
            linear-gradient(160deg, rgba(25,29,39,.72), rgba(13,15,20,.86)),
            url(/premium/portal-hero.jpg);
        }
        .gp-hero-scrim {
          position: absolute; inset: 0;
          background: linear-gradient(to top, ${BG} 4%, rgba(13,15,20,.55) 45%, rgba(13,15,20,.25) 100%);
        }
        .gp-hero-inner {
          position: relative; z-index: 1; width: 100%; max-width: 720px; margin: 0 auto;
          padding: 1.4rem 1.25rem 2rem; display: flex; flex-direction: column; justify-content: space-between;
        }
        .gp-hero-top { display: flex; align-items: center; justify-content: space-between; }
        .gp-hero-title { margin-top: auto; }
        .gp-eyebrow {
          font-size: .72rem; letter-spacing: .28em; text-transform: uppercase; color: ${GOLD};
          opacity: .9; margin-bottom: .35rem;
        }
        .gp-hero-title h1 {
          font-size: clamp(2.4rem, 8vw, 3.6rem); line-height: 1.02; font-weight: 600;
          letter-spacing: -.01em; margin: 0; color: #fbf7ef;
          text-shadow: 0 2px 30px rgba(0,0,0,.5);
        }
        .gp-hero-loc {
          display: inline-flex; align-items: center; gap: .35rem; margin-top: .6rem;
          font-size: .85rem; opacity: .75;
        }
        .gp-brandchip {
          display: inline-flex; align-items: center; gap: .35rem;
          font-size: .72rem; font-weight: 600; opacity: .85;
          padding: .3rem .6rem; border-radius: 999px;
          border: 1px solid rgba(201,169,110,.25); background: rgba(13,15,20,.4);
          backdrop-filter: blur(8px); white-space: nowrap;
        }
        .gp-container { position: relative; max-width: 720px; margin: 0 auto; padding: 0 1.25rem 3rem; }
        .gp-footer {
          display: flex; align-items: center; justify-content: center; gap: .4rem;
          margin-top: 2.5rem; font-size: .72rem; opacity: 0.4;
        }
        .gp-rise { animation: gpRise .6s cubic-bezier(.16,1,.3,1) both; }
        @keyframes gpRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .gp-rise { animation: none; }
        }
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
    <div style={{ ...cardStyle, marginTop: '-3.5rem' }} className="gp-card gp-rise">
      <h2 className="gp-serif" style={{ fontSize: '1.9rem', marginBottom: '.4rem', letterSpacing: '-.01em', color: '#fbf7ef', fontWeight: 600 }}>
        Welcome{step === 'contact' ? ` to ${propertyName}` : ''}
      </h2>
      <p style={{ opacity: 0.72, fontSize: '.92rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
        Verify with the email or phone on your booking to unlock your personal concierge.
      </p>

      {/* Value teaser — why this beats a generic AI tab. */}
      {step === 'contact' && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {[
            { Icon: Zap, text: 'Instant answers' },
            { Icon: MapPin, text: 'Local gems' },
            { Icon: ConciergeBell, text: '24/7 help' },
          ].map((b) => (
            <span key={b.text} style={teaserPill}><b.Icon size={14} aria-hidden style={{ color: GOLD }} /> {b.text}</span>
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
          <p style={{ fontSize: '.78rem', opacity: 0.6, marginTop: '.9rem', lineHeight: 1.5, textAlign: 'center' }} data-testid="gate-party-hint">
            Travelling with a group? Ask whoever booked to share their guest link — everyone
            in the party can open it instantly, no code needed.
          </p>
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
        .gp-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 75%);
          background-size: 200% 100%; animation: gpShimmer 1.4s infinite;
        }
        @keyframes gpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { .gp-shimmer { animation: none; } }
      `}</style>
    </div>
  );
}

// Soft synthesized bell chime via Web Audio — no audio asset needed. Gentle two-note
// ping. Best-effort: silently no-ops if Web Audio is unavailable or blocked.
function playChime() {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const AC = Ctx.AudioContext ?? Ctx.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
    setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 1600);
  } catch {
    /* audio not available — silent */
  }
}

function Concierge({ slug, propertyId, hostPreview, propertyName, guestName, reviewNudge, upsellOffers }: { slug: string; propertyId: string; hostPreview: boolean; propertyName: string; guestName: string | null; reviewNudge: ReviewNudgeConfig; upsellOffers: UpsellOffer[] }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    { role: 'assistant', content: `Hi${guestName ? ` ${guestName}` : ''}! I'm your concierge for ${propertyName}. Tap a category below for instant answers — or ask me anything.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [muted, setMuted] = useState(false);
  // 4c soft-gate: once a question is escalated to the host, offer to notify the guest
  // when the host replies. 'idle' shows the prompt; 'saved'/'skipped' hide it.
  const [notifyChoice, setNotifyChoice] = useState<'idle' | 'saved' | 'skipped'>('idle');
  // Add-on: one-tap product feedback. 'idle' shows the subtle micro-prompt; 'rated'
  // shows a brief thanks. Never a blocking modal.
  const [feedbackState, setFeedbackState] = useState<'idle' | 'rated'>('idle');
  // Add-on: review nudge. Shown at most once per session (React state only, NOT
  // localStorage). 'hidden' until a trigger; 'shown' while visible; 'dismissed' once closed.
  const [reviewNudgeState, setReviewNudgeState] = useState<'hidden' | 'shown' | 'dismissed'>('hidden');
  // "Message the host" composer: null = closed. When open, the guest types a free-text
  // issue that is sent to the host as a manual escalation (not to the AI).
  const [hostComposerOpen, setHostComposerOpen] = useState(false);
  const [hostMsg, setHostMsg] = useState('');
  const [hostSending, setHostSending] = useState(false);
  const [hostComposerError, setHostComposerError] = useState<string | null>(null);
  // Portal guard: overlays must render into document.body (see anySheetOpen effect below)
  // to escape the transformed .gp-rise ancestor, which would otherwise trap position:fixed
  // and make bottom sheets appear below the tapped card instead of pinned to the viewport.
  // createPortal requires the DOM, so we only portal after mount to stay SSR-safe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Timestamp of the newest message we've rendered, so polling only pulls newer ones.
  const lastSeenRef = useRef<string | null>(null);
  const hasEscalation = entries.some((e) => e.escalated) || entries.some((e) => e.role === 'host');
  const guestMsgCount = entries.filter((e) => e.role === 'guest').length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Default the chime to muted when the guest prefers reduced motion (a calm-experience signal).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setMuted(true);
    }
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [entries, busy]);

  // Lock body scroll while a bottom sheet is open so the underlying portal can't scroll
  // behind the sheet on mobile (a common bottom-sheet UX defect). Restored on close.
  const anySheetOpen = !!activeCategory || hostComposerOpen;
  useEffect(() => {
    if (!anySheetOpen || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [anySheetOpen]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setAsked(true);
    setSuggestions([]);
    // Bring the conversation into view after a card-driven query.
    setTimeout(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    const nextEntries: ChatEntry[] = [...entries, { role: 'guest', content: text }];
    setEntries(nextEntries);
    setInput('');
    setBusy(true);
    try {
      // Hosts previewing their own portal hit the read-only host endpoint (keyed by
      // property id) so no guest session/conversation/escalation is created. Real
      // guests use the verified guest chat endpoint (keyed by slug + session cookie).
      const res = hostPreview
        ? await fetch(`/api/host/properties/${propertyId}/preview-chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: text,
              history: entries
                .filter((m) => m.role === 'guest' || m.role === 'assistant')
                .slice(-12)
                .map((m) => ({ role: m.role === 'guest' ? 'user' : 'assistant', content: m.content })),
            }),
          })
        : await fetch(`/api/guest/${slug}/chat`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'I could not answer just now.');
      setEntries((e) => [...e, { role: 'assistant', content: json.answer, escalated: json.escalated, isEmergency: json.isEmergency }]);
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 3) : []);
    } catch (e) {
      setEntries((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.' }]);
    } finally { setBusy(false); }
  }, [busy, entries, hostPreview, propertyId, slug]);

  // Add-on: one-tap feedback. Records a private product_feedback row (guest path).
  // A positive rating (4-5) is the signal that surfaces the Review Nudge when the host
  // has it enabled + set to auto. Best-effort POST — never blocks the concierge.
  const submitFeedback = useCallback(async (rating: number) => {
    if (feedbackState !== 'idle') return;
    setFeedbackState('rated');
    if (rating >= 4 && reviewNudge.enabled && reviewNudge.auto && reviewNudgeState === 'hidden') {
      setReviewNudgeState('shown');
    }
    if (hostPreview) return; // host preview has no guest session — don't write feedback
    try {
      await fetch(`/api/guest/${slug}/feedback`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, page: 'guest_portal' }),
      });
    } catch { /* best-effort — feedback never blocks the experience */ }
  }, [feedbackState, reviewNudge, reviewNudgeState, hostPreview, slug]);

  // Review nudge visibility: when auto, only after a positive signal (shown once).
  // When not auto, a subtle always-available card until dismissed. Either way it is
  // an invitation, never shown more than once after dismissal, and never blocks chat.
  const showReviewNudge = reviewNudge.enabled && !!reviewNudge.url && (
    reviewNudge.auto ? reviewNudgeState === 'shown' : reviewNudgeState !== 'dismissed'
  );

  // Send the guest's typed issue straight to the host as a manual escalation. The guest
  // message is echoed locally and the host is notified server-side; the host's reply
  // arrives live via polling (see below). Never used in host preview.
  const sendToHost = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || hostSending) return;
    setHostSending(true);
    setHostComposerError(null);
    if (hostPreview) {
      // Preview mode has no guest session; just simulate locally so hosts can see the UX.
      setEntries((e) => [...e, { role: 'guest', content: trimmed, escalated: true }]);
      setHostComposerOpen(false);
      setHostMsg('');
      setHostSending(false);
      return;
    }
    try {
      const res = await fetch(`/api/guest/${slug}/escalate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not reach your host just now.');
      setEntries((e) => [...e, { role: 'guest', content: trimmed, escalated: true }]);
      setHostComposerOpen(false);
      setHostMsg('');
    } catch (e) {
      setHostComposerError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setHostSending(false);
    }
  }, [hostSending, hostPreview, slug]);

  // Hydrate prior conversation history on mount so a returning guest (new tab, reload,
  // came back later) sees their earlier messages AND any host reply — not just a fresh
  // greeting. Without this, the two-way loop only worked within one uninterrupted session.
  // Runs once; if history exists it replaces the greeting-only transcript and seeds the
  // poll cursor so the live poll picks up from the newest message.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hostPreview || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/guest/${slug}/messages`);
        if (!res.ok) return;
        const json = await res.json();
        const history: { role: string; content: string; created_at: string; model?: string | null }[] = json.messages ?? [];
        if (cancelled || history.length === 0) return;
        const hydrated: ChatEntry[] = history
          .filter((m) => m.role === 'guest' || m.role === 'assistant' || m.role === 'host')
          .map((m) => ({ role: m.role as 'guest' | 'assistant' | 'host', content: m.content }));
        if (hydrated.length === 0) return;
        lastSeenRef.current = history[history.length - 1]?.created_at ?? null;
        // Keep the greeting as the lead-in, then the real history beneath it.
        setEntries((e) => [e[0], ...hydrated]);
        setAsked(true);
      } catch { /* best-effort hydration */ }
    })();
    return () => { cancelled = true; };
  }, [hostPreview, slug]);

  // Live polling: once the conversation has reached the host, poll for host replies (and
  // any messages we haven't rendered) so the two-way chat updates without a refresh.
  useEffect(() => {
    if (hostPreview || !hasEscalation) return;
    let cancelled = false;
    async function poll() {
      try {
        const qs = lastSeenRef.current ? `?after=${encodeURIComponent(lastSeenRef.current)}` : '';
        const res = await fetch(`/api/guest/${slug}/messages${qs}`);
        if (!res.ok) return;
        const json = await res.json();
        const incoming: { role: string; content: string; created_at: string }[] = json.messages ?? [];
        if (cancelled || incoming.length === 0) return;
        // Only surface HOST replies via polling — guest + assistant turns are already
        // rendered optimistically by send()/sendToHost(). This avoids duplicates.
        const hostReplies = incoming.filter((m) => m.role === 'host');
        lastSeenRef.current = incoming[incoming.length - 1]?.created_at ?? lastSeenRef.current;
        if (hostReplies.length > 0) {
          if (!muted) playChime();
          setEntries((e) => [...e, ...hostReplies.map((m) => ({ role: 'host' as const, content: m.content }))]);
        }
      } catch { /* best-effort polling */ }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [hostPreview, hasEscalation, slug, muted]);

  // Handle a sub-choice tap: fire a pre-formed query, focus the free-text input, or open
  // the "Message the host" composer.
  function pickSubChoice(choice: SubChoice) {
    setActiveCategory(null);
    if (choice.query === FOCUS_INPUT) {
      setTimeout(() => inputRef.current?.focus(), 80);
      return;
    }
    if (choice.query === MESSAGE_HOST) {
      setHostComposerError(null);
      setHostMsg('');
      setTimeout(() => setHostComposerOpen(true), 60);
      return;
    }
    send(choice.query);
  }

  function openCategory(cat: Category, chime = false) {
    if (chime && !muted) playChime();
    setActiveCategory(cat);
  }


  return (
    <div className="gp-rise" style={{ marginTop: '-2rem' }}>
      {/* Presence banner — makes the concierge feel live and personal. The chime
          mute control now lives here (inline), replacing the old floating stack. */}
      <div style={presenceBar}>
        <DomeMark size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Your concierge</div>
          <div style={{ fontSize: '.74rem', opacity: 0.65, display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span className="gp-dot" /> Online · replies instantly
          </div>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="gp-mute"
          data-testid="button-toggle-chime"
          aria-label={muted ? 'Unmute chime' : 'Mute chime'}
          title={muted ? 'Unmute chime' : 'Mute chime'}
        >
          {muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
        </button>
      </div>

      {/* Choice-driven category cards — the primary, zero-typing UX. */}
      <div style={{ fontSize: '.72rem', opacity: 0.5, margin: '.25rem .15rem .6rem', textTransform: 'uppercase', letterSpacing: '.14em' }}>How can we help?</div>
      <div className="gp-cats" data-testid="category-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => openCategory(cat)}
            className="gp-cat gp-card"
            data-testid={`category-${cat.key}`}
          >
            <span className="gp-cat-icon"><cat.Icon size={22} aria-hidden /></span>
            <span className="gp-serif gp-cat-label">{cat.label}</span>
            <span className="gp-cat-sub">{cat.subtitle}</span>
          </button>
        ))}
      </div>

      {/* Add-on: Enhancements — host-configured upsell offers. Tapping a CTA routes
          through the existing escalation + notify() path so the host is alerted. */}
      {upsellOffers.length > 0 && (
        <UpsellSection slug={slug} offers={upsellOffers} hostPreview={hostPreview} />
      )}

      {/* Direct line to the host. Deliberately relocated ABOVE the chat (out of the
          thumb zone near the send bell) and given a confirm-style composer so guests
          don't trigger a host ping by accident. */}
      <button
        onClick={() => { setHostComposerError(null); setHostMsg(''); setHostComposerOpen(true); }}
        className="gp-host-link"
        data-testid="button-service-bell"
        aria-label="Message your host"
      >
        <UserRound size={15} aria-hidden /> Message your host directly
      </button>

      {/* Persistent AI disclosure (EU AI Act Art. 50). */}
      <div style={{ marginTop: '1.25rem' }}><AiDisclosure variant="banner" /></div>

      <div ref={chatRef} style={{ scrollMarginTop: '1rem' }}>
        <div ref={scrollRef} style={{ ...cardStyle, maxHeight: '48dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.85rem', padding: '1.1rem' }} data-testid="chat-view">
          {entries.map((m, i) => (
            <div key={i} className="gp-msg" style={{ display: 'flex', gap: '.5rem', alignSelf: m.role === 'guest' ? 'flex-end' : 'flex-start', maxWidth: '90%', flexDirection: m.role === 'guest' ? 'row-reverse' : 'row' }}>
              {m.role === 'assistant' && <span style={{ flexShrink: 0, marginTop: 2 }}><DomeMark size={26} /></span>}
              {m.role === 'host' && (
                <span style={{ flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, #e7d3a6, ${GOLD})`, color: '#1a1206' }} aria-hidden>
                  <UserRound size={15} />
                </span>
              )}
              <div>
                {m.role === 'host' && (
                  <div style={{ fontSize: '.7rem', fontWeight: 600, color: GOLD, marginBottom: '.2rem', letterSpacing: '.02em' }}>Your host</div>
                )}
                <div style={m.role === 'guest' ? bubbleGuest : m.role === 'host' ? bubbleHost : bubbleAssistant} data-testid={`msg-${m.role}-${i}`}>
                  {m.isEmergency && (
                    <div style={{ fontWeight: 700, color: '#e6a15c', marginBottom: '.25rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      <AlertTriangle size={14} aria-hidden /> For emergencies, contact local services first.
                    </div>
                  )}
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
      </div>

      {/* 4c soft-gate: contextual "Notify Me / Skip" once a question reaches the host.
          Never shown in host preview (no real guest session to attach consent to). */}
      {!hostPreview && hasEscalation && notifyChoice === 'idle' && (
        <NotifyMeCard slug={slug} onSaved={() => setNotifyChoice('saved')} onSkip={() => setNotifyChoice('skipped')} />
      )}
      {!hostPreview && notifyChoice === 'saved' && (
        <div style={{ ...alertOk, marginTop: '.9rem', marginBottom: 0 }} data-testid="notify-saved">
          Great — we&apos;ll let you know as soon as your host replies.
        </div>
      )}

      {/* Dynamic suggestion pills — natural follow-ups parsed from the AI reply. */}
      {asked && !busy && suggestions.length > 0 && (
        <div key={suggestions.join('|')} className="gp-pills" data-testid="suggestion-pills">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="gp-pill" data-testid="suggestion-pill">{s}</button>
          ))}
        </div>
      )}

      {/* Add-on: review nudge — a tasteful, dismissible invitation shown at most once
          per session (see showReviewNudge logic). Never blocks the concierge. */}
      {showReviewNudge && (
        <ReviewNudgeCard
          url={reviewNudge.url!}
          propertyName={propertyName}
          onDismiss={() => setReviewNudgeState('dismissed')}
        />
      )}

      {/* Add-on: one-tap product feedback — appears subtly after a couple of
          interactions. One tap to rate; a positive rating can surface the review nudge. */}
      {asked && !busy && guestMsgCount >= 2 && (
        <FeedbackWidget state={feedbackState} onRate={submitFeedback} />
      )}

      {/* De-emphasized free-text input — kept available but secondary to the cards.
          The send action is the concierge service bell: tapping it rings the concierge
          and submits the message. A soft chime plays on send when unmuted. */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) { if (!muted) playChime(); send(input); } }}
        style={{ display: 'flex', gap: '.5rem', marginTop: '.9rem', alignItems: 'stretch' }}
        data-testid="chat-form"
      >
        <input
          ref={inputRef}
          style={mutedInputStyle} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question, then ring the bell…" disabled={busy} data-testid="input-chat"
        />
        <button
          type="submit"
          className="gp-bell-send"
          disabled={busy || !input.trim()}
          data-testid="button-send-chat"
          aria-label="Ring the concierge to send"
          title="Ring the concierge"
        >
          <ConciergeBell size={20} aria-hidden />
        </button>
      </form>

      <AiDisclosure variant="note" />

      {/* Sub-choice slide-over — pre-formed options that instantly trigger the chat.
          Portaled to document.body so position:fixed resolves against the viewport and
          the sheet pins to the bottom of the screen (not below the tapped card). */}
      {mounted && activeCategory && createPortal(
        <div className="gp-sheet-scrim" onClick={() => setActiveCategory(null)} data-testid="subchoice-overlay">
          <div className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${activeCategory.label} options`} data-testid={`subchoice-${activeCategory.key}`}>
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><activeCategory.Icon size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">{activeCategory.label}</div>
                <div className="gp-sheet-sub">{activeCategory.subtitle}</div>
              </div>
              <button onClick={() => setActiveCategory(null)} className="gp-sheet-close" data-testid="button-close-subchoice" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="gp-sheet-hint">Tap an option for an instant answer</div>
            <div className="gp-sheet-choices">
              {activeCategory.choices.map((c) => {
                const isFocus = c.query === FOCUS_INPUT;
                return (
                  <button key={c.label} onClick={() => pickSubChoice(c)} className={`gp-subchoice${isFocus ? ' gp-subchoice-alt' : ''}`} data-testid={`subchoice-option-${activeCategory!.key}`}>
                    <span className="gp-subchoice-icon" aria-hidden>
                      {isFocus ? <MessageCircle size={16} /> : <activeCategory.Icon size={16} />}
                    </span>
                    <span className="gp-subchoice-label">{c.label}</span>
                    <ArrowRight size={15} aria-hidden className="gp-subchoice-arrow" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* "Message the host" composer — the guest types their own issue and confirms
          before it's sent to the host (no accidental pings). The host's reply arrives
          live in the chat above via polling. Portaled to document.body for the same
          fixed-positioning reason as the sub-choice sheet above. */}
      {mounted && hostComposerOpen && createPortal(
        <div className="gp-sheet-scrim" onClick={() => !hostSending && setHostComposerOpen(false)} data-testid="host-composer-overlay">
          <div className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Message your host" data-testid="host-composer">
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><UserRound size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">Message your host</div>
                <div className="gp-sheet-sub">Type your question or issue — we&rsquo;ll pass it straight to them.</div>
              </div>
              <button onClick={() => !hostSending && setHostComposerOpen(false)} className="gp-sheet-close" data-testid="button-close-host-composer" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); sendToHost(hostMsg); }}
              style={{ display: 'flex', flexDirection: 'column', gap: '.7rem', padding: '.25rem .2rem .2rem' }}
            >
              {hostComposerError && <div style={alertErr}>{hostComposerError}</div>}
              <textarea
                autoFocus
                value={hostMsg}
                onChange={(e) => setHostMsg(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="For example: The AC in the main bedroom isn't turning on — could you help?"
                data-testid="input-host-message"
                style={{
                  width: '100%', resize: 'vertical', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)',
                  color: '#ece7dd', padding: '.7rem .85rem', fontSize: '.92rem', lineHeight: 1.45,
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                className="gp-bell-send"
                disabled={hostSending || !hostMsg.trim()}
                data-testid="button-send-host-message"
                style={{ width: '100%', height: 'auto', padding: '.75rem 1rem', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.45rem', fontWeight: 600 }}
              >
                <Send size={16} aria-hidden /> {hostSending ? 'Sending…' : 'Send to host'}
              </button>
              <p className="faint" style={{ fontSize: '.72rem', textAlign: 'center', margin: 0, opacity: 0.6 }}>
                Your host is notified right away. Their reply appears here in your chat.
              </p>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Global (not scoped) so the portaled bottom sheets rendered into document.body
          still receive these styles. All selectors are gp-* prefixed — no collision risk. */}
      <style jsx global>{`
        .gp-dot {
          width: 7px; height: 7px; border-radius: 50%; background: ${GOLD};
          box-shadow: 0 0 0 0 ${GOLD}; animation: gpPulse 2s infinite;
        }
        .gp-cats { display: grid; grid-template-columns: repeat(2, 1fr); gap: .6rem; }
        @media (min-width: 520px) { .gp-cats { grid-template-columns: repeat(4, 1fr); } }
        .gp-cat {
          display: flex; flex-direction: column; align-items: flex-start; gap: .1rem;
          padding: .95rem .85rem; cursor: pointer; text-align: left; color: inherit;
          transition: transform .2s cubic-bezier(.16,1,.3,1), border-color .2s, background .2s, box-shadow .2s;
        }
        .gp-cat:hover {
          transform: translateY(-3px); border-color: rgba(201,169,110,.5);
          box-shadow: 0 14px 34px -18px rgba(201,169,110,.7);
        }
        .gp-cat:active { transform: translateY(-1px); }
        .gp-cat-icon {
          display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px;
          margin-bottom: .5rem; color: ${GOLD};
          background: rgba(201,169,110,.12); border: 1px solid rgba(201,169,110,.22);
        }
        .gp-cat-label { font-size: 1.12rem; font-weight: 600; line-height: 1.1; color: #f3ede1; }
        .gp-cat-sub { font-size: .72rem; opacity: .55; }
        .gp-pills { display: flex; gap: .45rem; flex-wrap: wrap; margin-top: .85rem; animation: gpFade .4s ease both; }
        .gp-pill {
          padding: .5rem .9rem; border-radius: 999px; cursor: pointer; color: #ece7dd;
          border: 1px solid rgba(201,169,110,.3); background: rgba(255,255,255,.05);
          backdrop-filter: blur(12px); font-size: .8rem;
          transition: border-color .18s, background .18s, transform .18s;
        }
        .gp-pill:hover { border-color: ${GOLD}; background: rgba(201,169,110,.12); transform: translateY(-1px); }
        .gp-bell-send {
          flex-shrink: 0; width: 52px; border-radius: 12px; border: none;
          background: linear-gradient(145deg, #e7d3a6, ${GOLD}); color: #1a1206; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 10px 26px -14px rgba(201,169,110,.9), inset 0 1px 1px rgba(255,255,255,.45);
          transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .18s, filter .18s;
        }
        .gp-bell-send:hover:not(:disabled) { transform: translateY(-2px) scale(1.03); box-shadow: 0 14px 32px -12px rgba(201,169,110,1), inset 0 1px 1px rgba(255,255,255,.45); }
        .gp-bell-send:active:not(:disabled) { transform: translateY(0) scale(.95); }
        .gp-bell-send:disabled { opacity: .45; filter: grayscale(.35); cursor: default; box-shadow: none; }
        .gp-host-link {
          display: inline-flex; align-items: center; gap: .4rem; margin: .7rem auto 0; padding: .4rem .2rem;
          background: none; border: none; color: ${GOLD}; cursor: pointer;
          font-size: .8rem; font-weight: 500; opacity: .82; width: 100%; justify-content: center;
          transition: opacity .18s;
        }
        .gp-host-link:hover { opacity: 1; text-decoration: underline; text-underline-offset: 3px; }
        .gp-typing {
          width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .5;
          animation: gpBlink 1.2s infinite;
        }
        .gp-typing:nth-child(2) { animation-delay: .2s; }
        .gp-typing:nth-child(3) { animation-delay: .4s; }
        .gp-msg { animation: gpMsg .35s cubic-bezier(.16,1,.3,1) both; }
        .gp-mute {
          flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; color: #ece7dd;
          border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04);
          display: grid; place-items: center; opacity: .7; transition: opacity .18s, transform .18s, background .18s;
        }
        .gp-mute:hover { opacity: 1; transform: translateY(-1px); background: rgba(255,255,255,.07); }
        .gp-sheet-scrim {
          position: fixed; inset: 0; z-index: 50; background: rgba(6,8,12,.6); backdrop-filter: blur(4px);
          display: flex; align-items: flex-end; justify-content: center; padding: 0;
          animation: gpFade .25s ease both;
        }
        @media (min-width: 560px) { .gp-sheet-scrim { align-items: center; padding: 1rem; } }
        .gp-sheet {
          width: 100%; max-width: 560px; border-radius: 22px 22px 0 0;
          padding: 1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom));
          animation: gpSheetUp .34s cubic-bezier(.16,1,.3,1) both;
        }
        @media (min-width: 560px) { .gp-sheet { border-radius: 22px; } }
        .gp-sheet-grip {
          width: 40px; height: 4px; border-radius: 999px; background: rgba(255,255,255,.18);
          margin: -.35rem auto .95rem;
        }
        @media (min-width: 560px) { .gp-sheet-grip { display: none; } }
        .gp-sheet-head { display: flex; align-items: center; gap: .75rem; margin-bottom: .35rem; }
        .gp-sheet-badge {
          width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0;
          box-shadow: inset 0 1px 1px rgba(255,255,255,.08);
        }
        .gp-sheet-title { font-size: 1.35rem; color: #fbf7ef; line-height: 1.15; }
        .gp-sheet-sub { font-size: .8rem; opacity: .6; margin-top: .1rem; }
        .gp-sheet-hint {
          font-size: .68rem; opacity: .42; text-transform: uppercase; letter-spacing: .14em;
          margin: 0 0 .85rem 3.35rem;
        }
        .gp-sheet-close {
          width: 36px; height: 36px; border-radius: 50%; cursor: pointer; color: inherit; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04);
          display: grid; place-items: center; opacity: .75; transition: opacity .18s, background .18s;
        }
        .gp-sheet-close:hover { opacity: 1; background: rgba(255,255,255,.08); }
        .gp-sheet-choices { display: grid; grid-template-columns: 1fr; gap: .5rem; }
        @media (min-width: 460px) { .gp-sheet-choices { grid-template-columns: repeat(2, 1fr); } }
        .gp-subchoice {
          display: flex; align-items: center; gap: .65rem;
          padding: .9rem 1rem; border-radius: 14px; cursor: pointer; color: #f0ebe1;
          border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.035);
          font-size: .92rem; font-weight: 500; text-align: left;
          transition: border-color .18s, background .18s, transform .18s, box-shadow .18s;
        }
        .gp-subchoice:hover {
          border-color: rgba(201,169,110,.55); background: rgba(201,169,110,.11);
          transform: translateY(-2px); box-shadow: 0 12px 26px -18px rgba(201,169,110,.8);
        }
        .gp-subchoice:active { transform: translateY(0); }
        .gp-subchoice-icon {
          display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
          color: ${GOLD}; background: rgba(201,169,110,.12); border: 1px solid rgba(201,169,110,.2);
        }
        .gp-subchoice-label { flex: 1; min-width: 0; line-height: 1.25; }
        .gp-subchoice-arrow { opacity: .4; flex-shrink: 0; transition: transform .18s, opacity .18s; }
        .gp-subchoice:hover .gp-subchoice-arrow { opacity: .85; transform: translateX(2px); }
        .gp-subchoice-alt {
          border-style: dashed; border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.02);
        }
        .gp-subchoice-alt .gp-subchoice-icon { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); color: #ece7dd; }
        @keyframes gpPulse { 0% { box-shadow: 0 0 0 0 ${GOLD}66; } 70% { box-shadow: 0 0 0 6px ${GOLD}00; } 100% { box-shadow: 0 0 0 0 ${GOLD}00; } }
        @keyframes gpBlink { 0%, 60%, 100% { opacity: .25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @keyframes gpMsg { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes gpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gpSheetUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .gp-dot, .gp-typing, .gp-msg, .gp-pills, .gp-sheet, .gp-sheet-scrim { animation: none; }
          .gp-cat:hover, .gp-pill:hover, .gp-bell-send:hover:not(:disabled), .gp-subchoice:hover, .gp-mute:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

// TCPA / consent fine print shown at the point of opt-in. Mirrors the host-side notice.
const GUEST_NOTIFY_FINE_PRINT =
  'By tapping Notify me you agree to receive a one-time automated message (SMS or email) from ' +
  'Moche.AI when your host replies. Message & data rates may apply. Reply STOP to opt out. ' +
  'Consent is not a condition of any service.';

// 4c — inline soft-gate. Captures a contact + explicit consent and posts to the
// notify-consent endpoint, which stores it on the guest's verified session row.
function NotifyMeCard({ slug, onSaved, onSkip }: { slug: string; onSaved: () => void; onSkip: () => void }) {
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setErr('Please tick the box to consent.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/guest/${slug}/notify-consent`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact, consent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save your preference.');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ ...cardStyle, marginTop: '.9rem', padding: '1.15rem' }} className="gp-card gp-rise" data-testid="notify-me-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
        <ConciergeBell size={18} aria-hidden style={{ color: GOLD }} />
        <span className="gp-serif" style={{ fontSize: '1.15rem', color: '#fbf7ef' }}>Want a heads-up when your host replies?</span>
      </div>
      <p style={{ opacity: 0.7, fontSize: '.85rem', margin: '0 0 .9rem', lineHeight: 1.45 }}>
        We&apos;ve passed your question to your host. Leave a contact and we&apos;ll ping you the moment they answer.
      </p>
      <form onSubmit={submit}>
        {err && <div style={{ ...alertErr, marginBottom: '.8rem' }} data-testid="notify-error">{err}</div>}
        <label style={labelStyle}>Email or phone</label>
        <input
          style={inputStyle} value={contact} onChange={(e) => setContact(e.target.value)}
          placeholder="you@email.com or +1 555 000 0000" autoComplete="off" required data-testid="input-notify-contact"
        />
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.76rem', opacity: 0.8, margin: '0 0 1rem', lineHeight: 1.45, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }} data-testid="checkbox-notify-consent"
          />
          <span>{GUEST_NOTIFY_FINE_PRINT}</span>
        </label>
        <button type="submit" style={btnStyle} className="gp-btn" disabled={busy || !contact.trim()} data-testid="button-notify-me">
          {busy ? 'Saving…' : 'Notify me'}
        </button>
        <button type="button" onClick={onSkip} style={linkBtn} data-testid="button-notify-skip">Skip</button>
      </form>
    </div>
  );
}

// Add-on: Enhancements — host-configured upsell offers rendered as frosted cards.
// Tapping the CTA routes through the EXISTING escalation + notify() path (the same
// mechanism the chat route uses for low-confidence questions) so the host is alerted
// in-app, by email, and (Pro+, consented) by SMS. No new guest channel is invented.
// Guest visibility is intentionally NOT gated — the host creating an offer is the opt-in.
function UpsellSection({ slug, offers, hostPreview }: { slug: string; offers: UpsellOffer[]; hostPreview: boolean }) {
  // Per-offer request state so each card independently reflects idle/sending/done.
  const [state, setState] = useState<Record<string, 'idle' | 'busy' | 'done' | 'error'>>({});

  const request = useCallback(async (offerId: string) => {
    if (state[offerId] === 'busy' || state[offerId] === 'done') return;
    // Host preview is read-only — reflect success without creating a real escalation.
    if (hostPreview) { setState((s) => ({ ...s, [offerId]: 'done' })); return; }
    setState((s) => ({ ...s, [offerId]: 'busy' }));
    try {
      const res = await fetch(`/api/guest/${slug}/upsell-request`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerId }),
      });
      if (!res.ok) throw new Error();
      setState((s) => ({ ...s, [offerId]: 'done' }));
    } catch {
      setState((s) => ({ ...s, [offerId]: 'error' }));
    }
  }, [hostPreview, slug, state]);

  return (
    <section style={{ marginTop: '1.5rem' }} data-testid="upsell-section">
      {/* Premium banner — drops to a gold-tinted dark gradient if the asset is absent. */}
      <PremiumImage
        src="/premium/enhancements-banner.jpg"
        alt=""
        aspectRatio="21 / 6"
        radius={16}
        sizes="(max-width: 720px) 100vw, 720px"
        className="gp-upsell-banner"
      >
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '.9rem 1.1rem', background: 'linear-gradient(to top, rgba(13,15,20,.75), transparent 70%)' }}>
          <span className="gp-serif" style={{ fontSize: '1.25rem', color: '#fbf7ef' }}>Elevate your stay</span>
        </div>
      </PremiumImage>
      <div style={{ fontSize: '.72rem', opacity: 0.5, margin: '.7rem .15rem .6rem', textTransform: 'uppercase', letterSpacing: '.14em' }}>
        Add to your stay
      </div>
      <div className="gp-upsells">
        {offers.map((offer) => {
          const st = state[offer.id] ?? 'idle';
          const done = st === 'done';
          return (
            <div key={offer.id} style={{ ...cardStyle, padding: '1.15rem' }} className="gp-card" data-testid={`upsell-offer-${offer.id}`}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.6rem' }}>
                <span className="gp-serif" style={{ fontSize: '1.15rem', color: '#fbf7ef', lineHeight: 1.2 }}>{offer.title}</span>
                {offer.price_text && (
                  <span style={{ color: GOLD, fontWeight: 600, fontSize: '.85rem', flexShrink: 0 }}>{offer.price_text}</span>
                )}
              </div>
              {offer.description && (
                <p style={{ opacity: 0.7, fontSize: '.85rem', margin: '.4rem 0 .9rem', lineHeight: 1.45 }}>{offer.description}</p>
              )}
              <button
                onClick={() => request(offer.id)}
                className="gp-upsell-cta"
                disabled={st === 'busy' || done}
                data-testid={`button-upsell-request-${offer.id}`}
              >
                {done ? (
                  <><Check size={15} aria-hidden /> Requested</>
                ) : st === 'busy' ? (
                  'Sending…'
                ) : (
                  <><Plus size={15} aria-hidden /> {offer.cta_label || 'Request'}</>
                )}
              </button>
              {st === 'error' && (
                <div style={{ ...alertErr, marginTop: '.7rem', marginBottom: 0 }} data-testid={`upsell-error-${offer.id}`}>
                  Couldn&apos;t send that just now. Please try again.
                </div>
              )}
              {done && (
                <div style={{ fontSize: '.74rem', opacity: 0.65, marginTop: '.55rem' }}>
                  Sent to your host — they&apos;ll follow up to confirm.
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .gp-upsells { display: grid; grid-template-columns: 1fr; gap: .6rem; }
        @media (min-width: 520px) { .gp-upsells { grid-template-columns: repeat(2, 1fr); } }
        .gp-upsell-cta {
          display: inline-flex; align-items: center; gap: .4rem; padding: .6rem 1rem;
          border-radius: 999px; cursor: pointer; font-size: .85rem; font-weight: 600;
          color: #1a1206; border: none; background: linear-gradient(145deg, #e7d3a6, ${GOLD});
          transition: transform .18s, box-shadow .18s, opacity .18s;
        }
        .gp-upsell-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px -14px rgba(201,169,110,.9); }
        .gp-upsell-cta:disabled { opacity: .7; cursor: default; }
        @media (prefers-reduced-motion: reduce) { .gp-upsell-cta:hover:not(:disabled) { transform: none; } }
      `}</style>
    </section>
  );
}

// Add-on: Review nudge — a tasteful, dismissible invitation to leave a review. Shown at
// most once per session (visibility governed by the caller's reviewNudgeState). The CTA
// opens the host-configured review URL in a new tab. Never blocks the concierge.
function ReviewNudgeCard({ url, propertyName, onDismiss }: { url: string; propertyName: string; onDismiss: () => void }) {
  return (
    <div style={{ ...cardStyle, marginTop: '.9rem', padding: '1.15rem' }} className="gp-card gp-rise" data-testid="review-nudge-card">
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        data-testid="button-review-nudge-dismiss"
        style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'inherit', opacity: 0.6, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      >
        <X size={15} aria-hidden />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem', paddingRight: '2rem' }}>
        <Star size={18} aria-hidden style={{ color: GOLD, fill: GOLD }} />
        <span className="gp-serif" style={{ fontSize: '1.15rem', color: '#fbf7ef' }}>Enjoying your stay?</span>
      </div>
      <p style={{ opacity: 0.7, fontSize: '.85rem', margin: '0 0 .9rem', lineHeight: 1.45 }}>
        If everything&apos;s been wonderful, a quick review for {propertyName} means the world.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="gp-review-cta"
        data-testid="link-review-nudge"
      >
        <Star size={15} aria-hidden /> Leave a review <ExternalLink size={13} aria-hidden style={{ opacity: 0.7 }} />
      </a>
      <style jsx>{`
        .gp-review-cta {
          display: inline-flex; align-items: center; gap: .45rem; padding: .65rem 1.1rem;
          border-radius: 999px; text-decoration: none; font-size: .85rem; font-weight: 600;
          color: #1a1206; background: linear-gradient(145deg, #e7d3a6, ${GOLD});
          transition: transform .18s, box-shadow .18s;
        }
        .gp-review-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px -14px rgba(201,169,110,.9); }
        @media (prefers-reduced-motion: reduce) { .gp-review-cta:hover { transform: none; } }
      `}</style>
    </div>
  );
}

// Add-on: one-tap product feedback — a subtle 1-5 star micro-prompt. One tap records a
// private product_feedback row and shows a brief thanks. Never a blocking modal; a
// positive (4-5) rating is the signal that can surface the Review Nudge.
function FeedbackWidget({ state, onRate }: { state: 'idle' | 'rated'; onRate: (rating: number) => void }) {
  const [hover, setHover] = useState(0);
  if (state === 'rated') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.9rem', fontSize: '.8rem', opacity: 0.7 }} data-testid="feedback-thanks">
        <Check size={15} aria-hidden style={{ color: GOLD }} /> Thanks for the feedback.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', marginTop: '.9rem', flexWrap: 'wrap' }} data-testid="feedback-widget">
      <span style={{ fontSize: '.8rem', opacity: 0.6 }}>How&apos;s your concierge experience?</span>
      <div style={{ display: 'inline-flex', gap: '.15rem' }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onRate(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`Rate ${n} of 5`}
            data-testid={`button-feedback-${n}`}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0, color: GOLD }}
          >
            <Star size={18} aria-hidden style={{ fill: n <= hover ? GOLD : 'transparent', opacity: n <= hover ? 1 : 0.5 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Inline styles (portal is brand-scoped, standalone from dashboard CSS) ---
const cardStyle: React.CSSProperties = { position: 'relative', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: '1.5rem', backdropFilter: 'blur(12px)', boxShadow: '0 20px 50px -30px rgba(0,0,0,.8)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', opacity: 0.7, marginBottom: '.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.8rem .9rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', color: 'inherit', fontSize: '1rem', marginBottom: '1rem', outline: 'none' };
const mutedInputStyle: React.CSSProperties = { flex: 1, padding: '.7rem .9rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.025)', color: 'inherit', fontSize: '.9rem', outline: 'none', opacity: 0.85 };
const btnStyle: React.CSSProperties = { width: '100%', padding: '.85rem', borderRadius: 12, border: 'none', background: `linear-gradient(145deg, #e7d3a6, ${GOLD})`, color: '#1a1206', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '.25rem' };
const linkBtn: React.CSSProperties = { width: '100%', background: 'none', border: 'none', color: 'inherit', opacity: 0.6, marginTop: '.75rem', cursor: 'pointer', fontSize: '.82rem' };
const teaserPill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .7rem', borderRadius: 999, border: '1px solid rgba(201,169,110,0.25)', background: 'rgba(255,255,255,0.03)', fontSize: '.78rem', fontWeight: 600 };
const presenceBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)', marginBottom: '1.25rem' };
const hostPreviewBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.65rem .85rem', borderRadius: 12, border: '1px solid rgba(201,169,110,0.35)', background: 'rgba(201,169,110,0.1)', color: '#e7d3a6', fontSize: '.8rem', lineHeight: 1.4, marginTop: '1rem', fontWeight: 500 };
const bubbleGuest: React.CSSProperties = { background: `linear-gradient(135deg, #e7d3a6, ${GOLD})`, color: '#1a1206', padding: '.65rem .9rem', borderRadius: '16px 16px 4px 16px', fontSize: '.92rem', lineHeight: 1.45, fontWeight: 500 };
const bubbleAssistant: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', padding: '.65rem .9rem', borderRadius: '16px 16px 16px 4px', fontSize: '.92rem', lineHeight: 1.45, color: 'inherit' };
// Host reply bubble — distinct from the AI concierge (gold-tinted border + surface) so
// guests can tell a real host response apart from the automated concierge.
const bubbleHost: React.CSSProperties = { background: 'rgba(201,169,110,0.12)', border: `1px solid ${GOLD}55`, padding: '.65rem .9rem', borderRadius: '16px 16px 16px 4px', fontSize: '.92rem', lineHeight: 1.45, color: 'inherit' };
const alertErr: React.CSSProperties = { background: 'rgba(230,161,92,0.12)', border: '1px solid rgba(230,161,92,0.4)', color: '#e6a15c', padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
const alertOk: React.CSSProperties = { background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.35)', color: GOLD, padding: '.6rem .8rem', borderRadius: 10, fontSize: '.85rem', marginBottom: '1rem' };
