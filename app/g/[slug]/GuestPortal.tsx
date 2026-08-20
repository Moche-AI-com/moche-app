'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  UtensilsCrossed, Compass, KeyRound, Sparkles, Wifi, Star, MessageCircle,
  ConciergeBell, X, ArrowRight, Zap, MapPin, Eye,
  AlertTriangle, ExternalLink, Check, Plus, UserRound, Send, Wrench,
  Paperclip, Loader2, CheckCircle2, Phone, Globe, ShoppingCart, ChevronLeft, ChevronRight,
  Minus, Search, Mail, Package, Home, type LucideIcon,
} from 'lucide-react';
import { AiDisclosure } from '@/components/AiDisclosure';
import { PremiumImage } from '@/components/PremiumImage';
import { formatDistance } from '@/lib/local/distance';
import { NEARBY_CATEGORY_LABEL } from '@/lib/local/categories';
import {
  clampExtraQuantity, extraQuantityCeiling, groupExtrasByCategory, quantityAdvisory,
  isPackageExtra, normalizeExtraOptions, quantitySummary,
  DEFAULT_EXTRA_QUANTITY, type ExtrasGroup,
} from '@/lib/guest/extras';
import {
  PORTAL_LANGUAGES, AUTO_LANGUAGE, searchLanguages, languageNativeLabel, resolveLanguage,
} from '@/lib/guest/languages';
import { linkify } from '@/lib/guest/linkify';
import { sectionizeHistory, sectionPreview, type HistoryMessage, type HistorySection } from '@/lib/guest/history';

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
// Opens the structured "Report an issue" interview panel instead of sending a chat message.
const SERVICE_REQUEST = '__SERVICE_REQUEST__';

/**
 * Keeps a portaled sheet self-contained without a dependency: focus moves into the
 * sheet, Tab cycles inside it, Escape dismisses it, and the invoking control regains
 * focus after close. It also prevents the underlying portal from scrolling.
 */
function useSheetDismiss({ active, onClose }: { active: boolean; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const focusable = () => Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => !element.hasAttribute('hidden'));
    const focusTimer = window.setTimeout(() => (focusable()[0] ?? sheetRef.current)?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      if (targets.length === 0) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      }, 0);
    };
  }, [active]);

  return sheetRef;
}

function scrollToPortalHome() {
  if (typeof window === 'undefined') return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

interface SubChoice { label: string; query: string }
interface Category {
  key: string;
  label: string;
  Icon: LucideIcon;
  subtitle: string;
  choices: SubChoice[];
  /**
   * When set, tapping the card performs this action immediately instead of
   * opening the sub-choice sheet. "Ask anything" uses it to drop the guest
   * straight into the chat input — asking them to pick a canned question first
   * is precisely the friction that card exists to avoid.
   */
  direct?: string;
  /** Renders wider and with a filled treatment as the grid's lead action. */
  primary?: boolean;
}

// Choice-driven categories (zero-typing UX). Each opens a sub-choice screen whose taps
// fire a pre-formed natural-language query at the existing concierge chat API.
// Sentinel query: open the chat straight away with the input focused. Used by the
// "Ask anything" card, which must never make a guest tap through a sub-choice sheet
// just to type their own question.
const CATEGORIES: Category[] = [
  // Card-set rule (Guest UX pass): a conversational tile only earns its place if
  // the concierge can answer its questions CONFIDENTLY from the property Brain or
  // from verified local data. Questions whose answer only the host knows — where
  // the toiletries live, which room is "bedroom 1", when the bins go out — are not
  // tiles: they route to the host through Report an issue / Message your host, or
  // are escalated automatically by the no-guessing contract in lib/guest/concierge.
  //
  // RETIRED (Guest card pass, per the "nothing is deleted" rule):
  //
  // 'ask' — "Ask anything" was a card that did nothing but focus the chat input that
  //   already sits directly beneath the grid. It read as a sixth topic while being a
  //   no-op, and it consumed the full-width primary slot that the guest's real
  //   entry point (the chat box itself) occupies. Guests type in the chat; they do
  //   not need a card to be told they may. Its FOCUS_INPUT sentinel is retained
  //   below because openCategory still honours it for any future direct tile.
  //
  // {
  //   key: 'ask', label: 'Ask anything', Icon: MessageCircle, subtitle: 'Type your own question',
  //   choices: [], direct: FOCUS_INPUT, primary: true,
  // },
  {
    key: 'stay', label: 'Your stay', Icon: KeyRound, subtitle: 'Arrival, departure & access',
    choices: [
      { label: 'Check-in time', query: 'What is the check-in time and process?' },
      { label: 'Check-out time', query: 'What is the check-out time and process?' },
      { label: 'Getting in', query: 'How do I access the property — door code or lockbox?' },
      { label: 'Early arrival', query: 'Is early check-in or luggage drop-off possible?' },
      { label: 'Late checkout', query: 'Is a late check-out possible?' },
      { label: 'Parking', query: 'Where can I park?' },
    ],
  },
  {
    key: 'house', label: 'In the home', Icon: Wifi, subtitle: 'WiFi, rules & essentials',
    choices: [
      { label: 'WiFi password', query: 'What is the WiFi network name and password?' },
      { label: 'House rules', query: 'What are the house rules?' },
      { label: 'Appliances', query: 'How do I use the appliances — TV, thermostat, coffee maker?' },
      { label: 'Laundry', query: 'Is there a washer, dryer, or laundry service?' },
      { label: 'Trash & recycling', query: 'How does the trash and recycling work?' },
      { label: 'Emergency info', query: 'What should I do in an emergency, and who do I contact?' },
    ],
  },
  {
    key: 'dining', label: 'Eat & drink', Icon: UtensilsCrossed, subtitle: 'Restaurants, cafés & bars',
    choices: [
      { label: 'Casual dining', query: 'What are the best casual dining spots nearby?' },
      { label: 'Fine dining', query: 'Can you recommend upscale or fine dining restaurants nearby?' },
      { label: 'Coffee', query: 'Where can I get great coffee nearby?' },
      { label: 'Drinks', query: 'What are good bars or places for a drink nearby?' },
      { label: 'Takeout', query: 'What are good takeout or delivery options nearby?' },
      { label: 'Grocery', query: 'Where is the nearest grocery store?' },
    ],
  },
  {
    key: 'local', label: 'Explore nearby', Icon: Compass, subtitle: 'Things to see & do',
    choices: [
      { label: 'Top attractions', query: 'What are the top attractions and things to do nearby?' },
      { label: 'Nature & outdoors', query: 'Are there good beaches, parks, or trails nearby?' },
      { label: 'Family friendly', query: 'What are some family-friendly activities nearby?' },
      { label: 'Nightlife', query: 'What is the nightlife like around here?' },
      { label: 'Hidden gems', query: "What are some local hidden gems most visitors don't know about?" },
      { label: 'Getting around', query: 'How do I get around the area — transit, taxis, or rideshare?' },
    ],
  },
  {
    key: 'favorites', label: "Host's picks", Icon: Star, subtitle: 'Personally recommended',
    choices: [
      { label: "Host's top picks", query: "What are the host's personal favorite recommendations nearby?" },
      { label: 'Best restaurants', query: 'Which restaurants does the host recommend most?' },
      { label: 'Must-see spots', query: 'What are the must-see spots the host recommends?' },
      { label: 'Local favorites', query: 'What local favorites should I not miss?' },
    ],
  },
  // Retired tiles are kept here (commented, per the "nothing is deleted" rule) with the
  // reason they were retired, so a future pass can see what was tried:
  //
  // 'request' — mixed genuine questions with concrete requests-for-a-thing. Those now
  //   live in the Extras card and the Report an issue card.
  //
  // 'housekeeping' — retired in the Guest UX pass. Its chips ("Toiletries", "Trash &
  //   Recycling", "Laundry") were the single largest source of confident-sounding
  //   guesses: the concierge cannot know where a specific home keeps its toiletries.
  //   The two chips the Brain reliably DOES cover (trash, laundry) moved into
  //   'In the home'; "Toiletries" was dropped entirely and now escalates like any
  //   other host-only fact.
  //
  // 'checkinout' / 'wifi' — merged into 'Your stay' and 'In the home' respectively, to
  //   get the grid down to six tiles so a guest sees every option without scrolling.
];

interface ChatPlaceRef {
  id: string;
  name: string;
  category: string;
}

// Shape returned by GET /api/guest/[slug]/places/[id] — every link here is server-
// constructed from verified DB fields, never from the model's own text (WS-5).
interface PlaceDetail {
  id: string;
  name: string;
  category: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  distanceM: number | null;
  hostNote: string | null;
  hostFavorite: boolean;
  mapsUrl: string | null;
  websiteUrl: string | null;
  telHref: string | null;
}

interface ChatEntry {
    id?: string;
  role: 'guest' | 'assistant' | 'host';
  content: string;
  escalated?: boolean;
  isEmergency?: boolean;
  places?: ChatPlaceRef[];
}

export interface ReviewNudgeConfig { enabled: boolean; auto: boolean; url: string | null }
export interface ExtraOffer {
  id: string;
  title: string;
  description: string | null;
  price_text: string | null;
  cta_label: string | null;
  category: string | null;
  is_favorite: boolean;
  /** Advisory per-request ceiling set by the host; null means the app default. */
  max_quantity: number | null;
  /**
   * 'quantity' — a countable item with a stepper (towels, beach chairs, a bike).
   * 'package'  — one bookable bundle (golf package, wedding package); no stepper.
   * Absent on rows written before the Guest UX migration; treated as 'quantity'.
   */
  kind?: string | null;
  /** Host-named axis of choice shown above the variant picker, e.g. "Colour". */
  option_label?: string | null;
  /** Concrete variants the guest picks between, e.g. ["Blue bike", "Pink bike"]. */
  options?: string[] | null;
  /** What one unit is, in guest words: "towels", "chairs". Shown beside the stepper. */
  unit_label?: string | null;
  /** Longer guest-facing detail: what's included, exclusions, lead time. */
  details?: string | null;
}

/** Moche-AI dome/bell mark — inlined so the brand-scoped portal needs no external CSS. */
function DomeMark({ size = 40 }: { size?: number }) {
      const rawId = useId();
    const gid = `gp-brand-${rawId.replace(/:/g, '')}`;
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
        <path d="M13 34a11 11 0 0 1 22 0" stroke={`url(#${gid})`} strokeWidth="2.4" opacity="0.5" fill="none" />
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
  extraOffers: ExtraOffer[];
}) {
  const [verified, setVerified] = useState(props.initialVerified);
  const [guestName, setGuestName] = useState(props.guestName);
  // Arrival curtain (see <ArrivalCurtain>). A guest who has just typed their code is
  // in the single highest-stakes second of the whole product, and what they used to
  // get was the gate vanishing and a half-laid-out portal snapping into place around
  // them. `arriving` is true from the moment the code is accepted until the curtain
  // has covered that work and bowed out. The portal mounts and loads UNDERNEATH it.
  const [arriving, setArriving] = useState(false);
  // Chat history moved OUT of the chat box and behind the brand pill. Owned here
  // rather than in <Concierge> because the pill lives in the hero, above it — and
  // because the sheet loads its own data, the two never need to share chat state.
  const [historyOpen, setHistoryOpen] = useState(false);
  // A host previewing the portal has no guest session, so there is no history to
  // read and the endpoint would 401. The pill stays inert for them.
  const historyAvailable = verified && !props.hostPreview;

  return (
    <div
      className={`gp-root ${props.fontClassName}`}
      style={{
        minHeight: '100dvh',
        background: BG,
        color: '#ece7dd',
        colorScheme: 'dark',
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
            {historyAvailable ? (
              <button
                type="button"
                className="gp-brandchip gp-brandchip-btn"
                onClick={() => setHistoryOpen(true)}
                data-testid="button-chat-history"
                aria-label="Open your conversation history"
                title="Your conversation history"
              >
                {/* Guest card pass: this chip used to read "Moche.AI", which looks like a
                    brand badge, not a control — guests did not know it opened anything.
                    It now says what it does. The brand mark stays as the leading glyph. */}
                <DomeMark size={15} />
                <span>Chat <span style={{ color: GOLD }}>History</span></span>
                <ChevronRight size={13} aria-hidden style={{ opacity: 0.6, marginLeft: -2 }} />
              </button>
            ) : (
              <span className="gp-brandchip">
                <DomeMark size={15} />
                <span>Moche<span style={{ color: GOLD }}>.AI</span></span>
              </span>
            )}
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
            onVerified={(name) => { setArriving(true); setVerified(true); setGuestName(name); }}
          />
        ) : (
          // Mounted immediately but held at opacity 0 while the curtain is up, so every
          // effect, fetch, font and image resolves BEFORE the guest sees anything. The
          // reveal is then a single graceful fade of a finished page rather than a
          // sequence of things popping into position.
          <div className={arriving ? 'gp-arriving' : 'gp-arrived'} aria-hidden={arriving || undefined}>
            <Concierge
              slug={props.slug}
              propertyId={props.propertyId}
              hostPreview={props.hostPreview}
              propertyName={props.propertyName}
              guestName={guestName}
              reviewNudge={props.reviewNudge}
              extraOffers={props.extraOffers}
            />
          </div>
        )}

        {arriving && (
          <ArrivalCurtain propertyName={props.propertyName} onDone={() => setArriving(false)} />
        )}

        {historyOpen && (
          <ChatHistorySheet
            slug={props.slug}
            onClose={() => setHistoryOpen(false)}
            onHome={() => {
              setHistoryOpen(false);
              scrollToPortalHome();
            }}
          />
        )}

        <footer className="gp-footer">
          <DomeMark size={14} />
          <span>Powered by Moche-AI · Your host verifies access. We never share your details.</span>
        </footer>
      </div>

      {/* Portal-scoped styles + motion. Standalone from dashboard CSS. */}
      <style jsx global>{`
        .gp-serif { font-family: var(--font-portal-serif), Georgia, serif; }
        .gp-root input,
        .gp-root textarea,
        .gp-root select,
        .gp-sheet input,
        .gp-sheet textarea,
        .gp-sheet select {
          color: #fbf7ef;
          -webkit-text-fill-color: #fbf7ef;
          caret-color: #e7d3a6;
        }
        .gp-root input::placeholder,
        .gp-root textarea::placeholder,
        .gp-sheet input::placeholder,
        .gp-sheet textarea::placeholder {
          color: rgba(236,231,221,.62);
          opacity: 1;
        }
        /* Guest UX pass: the hero was 58dvh, which pushed every actionable card below
           the fold and made "scroll" the first thing a guest did. 42dvh still reads as
           a full-bleed property photo while letting the top of the card grid land in
           view on a phone. */
        .gp-hero { position: relative; min-height: 42dvh; display: flex; overflow: hidden; }
        @media (min-width: 700px) { .gp-hero { min-height: 48dvh; } }
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
          font-size: clamp(1.9rem, 6.4vw, 3rem); line-height: 1.04; font-weight: 600;
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
        /* The pill doubles as the history entry point once a guest is verified, so it
           needs a real tap affordance and a 44px-tall target without looking like a
           second primary action competing with the concierge itself. */
        .gp-brandchip-btn {
          cursor: pointer; color: inherit; font: inherit; opacity: .9;
          min-height: 34px; padding: .42rem .7rem;
          transition: border-color .18s, background .18s, opacity .18s, transform .18s;
        }
        .gp-brandchip-btn:hover {
          opacity: 1; border-color: rgba(201,169,110,.55);
          background: rgba(13,15,20,.62); transform: translateY(-1px);
        }
        .gp-brandchip-btn:active { transform: translateY(0); }
        .gp-container { position: relative; max-width: 720px; margin: 0 auto; padding: 0 1.25rem 3rem; }
        .gp-footer {
          display: flex; align-items: center; justify-content: center; gap: .4rem;
          margin-top: 2.5rem; font-size: .72rem; opacity: 0.4;
        }
        .gp-rise { animation: gpRise .6s cubic-bezier(.16,1,.3,1) both; }
        @keyframes gpRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        /* The portal while the arrival curtain is up: fully mounted and laid out, but
           invisible and inert. visibility (not display) is deliberate — the browser
           still performs layout and still fetches the images, which is the entire
           point of holding the curtain there. */
        .gp-arriving { opacity: 0; visibility: hidden; pointer-events: none; }
        /* The handover. Slightly slower and gentler than .gp-rise because it moves the
           whole page at once rather than a single card. */
        .gp-arrived { animation: gpArrive .5s cubic-bezier(.16,1,.3,1) both; }
        @keyframes gpArrive { from { opacity: 0; transform: translateY(10px) scale(.995); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .gp-rise, .gp-arrived { animation: none; }
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

  const verifyStartInFlight = useRef(false);
  const verifyConfirmInFlight = useRef(false);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    // If Turnstile is configured but hasn't produced a token yet, guide the guest
    // instead of firing a request the server will reject with the generic bot error.
    if (turnstileSiteKey && !turnstileToken.current) {
      setErr('Please complete the verification checkbox above, then tap Send code.');
      return;
    }
    if (verifyStartInFlight.current) return;
    verifyStartInFlight.current = true;
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
        } finally { verifyStartInFlight.current = false; setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
        if (verifyConfirmInFlight.current) return;
    verifyConfirmInFlight.current = true;
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
        } finally { verifyConfirmInFlight.current = false; setBusy(false); }
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

/* -------------------------------------------------------------------------- */
/* Arrival curtain                                                            */
/* -------------------------------------------------------------------------- */

// Shown for the moment between "code accepted" and "portal ready". Its job is not
// decoration — it is to OWN the load. The portal mounts behind it and spends this
// time resolving fonts, images and its first fetches; the curtain guarantees the
// guest never watches that happen. It leaves on the later of a minimum dwell (so it
// never flickers) and the browser reporting a settled frame, then hands over with a
// single fade.
//
// The bell is the brand's own mark of service, so it is what rings here: a soft
// swing with two gold rings expanding out of it, plus the synthesized two-note chime
// retired from the old mute toggle below. Audio is a best-effort courtesy — it is
// unlocked by the guest's own tap on "Verify", and silently skipped if blocked.
const ARRIVAL_MIN_MS = 1600;
const ARRIVAL_FADE_MS = 520;

function playArrivalChime() {
  try {
    const Ctx = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
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
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
    setTimeout(() => { try { void ctx.close(); } catch { /* noop */ } }, 1600);
  } catch { /* audio is a courtesy, never a requirement */ }
}

function ArrivalCurtain({ propertyName, onDone }: { propertyName: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    playArrivalChime();

    // The portal is scrolled to the top and frozen while the curtain is up, so a
    // guest who flicks the screen mid-load does not reveal the page they are meant
    // to be shielded from.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    const finish = () => {
      if (cancelled) return;
      setLeaving(true);
      timers.push(setTimeout(() => { if (!cancelled) doneRef.current(); }, ARRIVAL_FADE_MS));
    };

    // Wait for the LATER of: the minimum dwell, and the page actually being quiet.
    // Fonts are the usual culprit behind a late layout shift, so they are awaited
    // explicitly; the double rAF then lets the resulting paint land before we lift.
    const dwell = new Promise<void>((r) => timers.push(setTimeout(r, ARRIVAL_MIN_MS)));
    const settled = Promise.resolve(document.fonts?.ready)
      .catch(() => undefined)
      .then(() => new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      }));
    // A stuck font load must never strand a guest on a loading screen, so the whole
    // thing is capped well short of anything a person would call "broken".
    const cap = new Promise<void>((r) => timers.push(setTimeout(r, 4000)));
    void Promise.race([Promise.all([dwell, settled]).then(() => undefined), cap]).then(finish);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className={`gp-curtain${leaving ? ' gp-curtain-out' : ''}`}
      role="status"
      aria-live="polite"
      data-testid="arrival-curtain"
    >
      <div className="gp-curtain-inner">
        <div className="gp-curtain-bell" aria-hidden>
          <span className="gp-curtain-ring" />
          <span className="gp-curtain-ring gp-curtain-ring-2" />
          <ConciergeBell size={40} strokeWidth={1.4} />
        </div>
        <div className="gp-serif gp-curtain-title">{propertyName}</div>
        <div className="gp-curtain-sub">Preparing your concierge</div>
        <div className="gp-curtain-bar"><span /></div>
      </div>

      <style jsx>{`
        .gp-curtain {
          position: fixed; inset: 0; z-index: 80;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom));
          background:
            radial-gradient(90% 60% at 50% 38%, rgba(201,169,110,.13), transparent 70%),
            ${BG};
          color: #ece7dd;
          animation: gpCurtainIn .3s ease both;
        }
        .gp-curtain-out {
          animation: gpCurtainOut ${ARRIVAL_FADE_MS}ms cubic-bezier(.4, 0, .2, 1) both;
          pointer-events: none;
        }
        .gp-curtain-inner { text-align: center; max-width: 22rem; }
        .gp-curtain-bell {
          position: relative; display: inline-flex; align-items: center; justify-content: center;
          width: 92px; height: 92px; margin-bottom: 1.35rem;
          border-radius: 50%; color: ${GOLD};
          background: rgba(201,169,110,.08);
          border: 1px solid rgba(201,169,110,.24);
          animation: gpBellSwing 1.5s cubic-bezier(.36,.07,.19,.97) .12s 2 both;
          transform-origin: 50% 22%;
        }
        /* Rings read as the sound leaving the bell, which is why they are staggered
           to the swing rather than looping on their own clock. */
        .gp-curtain-ring {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1px solid rgba(201,169,110,.5);
          animation: gpBellRing 1.5s ease-out .12s infinite both;
        }
        .gp-curtain-ring-2 { animation-delay: .68s; }
        .gp-curtain-title { font-size: 1.5rem; line-height: 1.25; color: #fbf7ef; }
        .gp-curtain-sub {
          margin-top: .45rem; font-size: .82rem; opacity: .6;
          letter-spacing: .1em; text-transform: uppercase;
        }
        .gp-curtain-bar {
          position: relative; overflow: hidden;
          width: 108px; height: 2px; margin: 1.5rem auto 0;
          border-radius: 999px; background: rgba(255,255,255,.09);
        }
        .gp-curtain-bar > span {
          position: absolute; inset: 0; display: block;
          background: linear-gradient(90deg, transparent, ${GOLD}, transparent);
          animation: gpCurtainBar 1.35s ease-in-out infinite;
        }
        @keyframes gpCurtainIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gpCurtainOut {
          from { opacity: 1; }
          to { opacity: 0; visibility: hidden; }
        }
        @keyframes gpBellSwing {
          0%, 100% { transform: rotate(0deg); }
          8% { transform: rotate(11deg); }
          20% { transform: rotate(-8deg); }
          32% { transform: rotate(5deg); }
          44% { transform: rotate(-3deg); }
          56% { transform: rotate(1deg); }
          68% { transform: rotate(0deg); }
        }
        @keyframes gpBellRing {
          0% { opacity: .55; transform: scale(1); }
          70% { opacity: 0; transform: scale(1.75); }
          100% { opacity: 0; transform: scale(1.75); }
        }
        @keyframes gpCurtainBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        /* Reduced motion keeps the curtain and its fade — those carry meaning and
           prevent the jarring snap this whole component exists to remove — and drops
           only the decorative swing, rings and sweep. */
        @media (prefers-reduced-motion: reduce) {
          .gp-curtain-bell, .gp-curtain-ring, .gp-curtain-bar > span { animation: none; }
          .gp-curtain-ring { opacity: .3; }
        }
      `}</style>
    </div>
  );
}

// RETIRED (Guest UX pass) — the synthesized Web Audio chime and its mute toggle.
//
// Removed because the control did nothing a guest could perceive as useful: the
// chime only fired on send and on a polled host reply, most guests browse with a
// muted phone, and the toggle occupied the single most valuable slot in the
// presence bar. That slot now holds the language selector, which every non-English
// guest needs on their first visit.
//
// Kept here, commented, per the codebase's "nothing is deleted" rule, in case an
// opt-in arrival/host-reply sound is ever wanted as a real notification setting
// rather than an unexplained speaker icon.
//
// // Soft synthesized bell chime via Web Audio — no audio asset needed. Gentle two-note
// // ping. Best-effort: silently no-ops if Web Audio is unavailable or blocked.
// function playChime() {
//   try {
//     const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
//     const AC = Ctx.AudioContext ?? Ctx.webkitAudioContext;
//     if (!AC) return;
//     const ctx = new AC();
//     const now = ctx.currentTime;
//     [880, 1318.5].forEach((freq, i) => {
//       const osc = ctx.createOscillator();
//       const gain = ctx.createGain();
//       osc.type = 'sine';
//       osc.frequency.value = freq;
//       const t = now + i * 0.12;
//       gain.gain.setValueAtTime(0.0001, t);
//       gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
//       gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
//       osc.connect(gain).connect(ctx.destination);
//       osc.start(t);
//       osc.stop(t + 1.2);
//     });
//     setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 1600);
//   } catch {
//     /* audio not available — silent */
//   }
// }

function Concierge({ slug, propertyId, hostPreview, propertyName, guestName, reviewNudge, extraOffers }: { slug: string; propertyId: string; hostPreview: boolean; propertyName: string; guestName: string | null; reviewNudge: ReviewNudgeConfig; extraOffers: ExtraOffer[] }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    // The cards are ABOVE this chat box, not below it. The old copy said "below" and
    // sent guests scrolling past the input looking for something that was never there.
    { role: 'assistant', content: `Hi${guestName ? ` ${guestName}` : ''}! I'm your concierge for ${propertyName}. Tap any card above for instant answers — or just type your question here.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const sendInFlight = useRef(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  // Guest UX pass — the guest's reading language, chosen from the Globe picker that
  // replaced the mute toggle. `AUTO_LANGUAGE` means "reply in whatever I write in",
  // which is the right default: it is correct for an English guest and degrades
  // gracefully for everyone else without forcing a choice on arrival.
  const [language, setLanguage] = useState<string>(AUTO_LANGUAGE);
  const [langOpen, setLangOpen] = useState(false);
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
  // "Report an issue" interview panel (WS-7): a guided, turn-by-turn safety-triaged
  // interview, distinct from the free-text "Message the host" composer above.
  const [srOpen, setSrOpen] = useState(false);
  const [srTurns, setSrTurns] = useState<{ role: 'guest' | 'assistant'; text: string; choices?: string[] | null }[]>([]);
  const [srTicketId, setSrTicketId] = useState<string | null>(null);
  const [srStatus, setSrStatus] = useState<'idle' | 'in_progress' | 'completed' | 'safety_escalated'>('idle');
  const [srInput, setSrInput] = useState('');
  const [srBusy, setSrBusy] = useState(false);
  const [srError, setSrError] = useState<string | null>(null);
  const [srPendingMedia, setSrPendingMedia] = useState<string[]>([]);
  const [srUploading, setSrUploading] = useState(false);
  const srFileInputRef = useRef<HTMLInputElement>(null);
  // WS-5 — place-detail bottom sheet. `placeDetail` is fetched fresh from the server
  // (never rendered from the model's chat text) so links shown here are always verified.
  const [placeDetailId, setPlaceDetailId] = useState<string | null>(null);
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null);
  const [placeDetailLoading, setPlaceDetailLoading] = useState(false);
  const [placeDetailError, setPlaceDetailError] = useState<string | null>(null);
  // Change 2 — Extras now lives in its own card; this toggles the offers list open/closed.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const extrasRef = useRef<HTMLDivElement>(null);
  // Portal guard: overlays must render into document.body (see anySheetOpen effect below)
  // to escape the transformed .gp-rise ancestor, which would otherwise trap position:fixed
  // and make bottom sheets appear below the tapped card instead of pinned to the viewport.
  // createPortal requires the DOM, so we only portal after mount to stay SSR-safe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Timestamp of the newest message we've rendered, so polling only pulls newer ones.
  const lastSeenRef = useRef<string | null>(null);
  // True once this stay has any stored conversation at all. Set by the mount effect
  // below. It keeps the host-reply poll alive for a guest who escalated, closed the
  // tab and came back — the poll used to depend on replayed messages being in the
  // chat box, and the chat box no longer replays them.
  const [hasPriorHistory, setHasPriorHistory] = useState(false);
  const hasEscalation = hasPriorHistory || entries.some((e) => e.escalated) || entries.some((e) => e.role === 'host');
  const guestMsgCount = entries.filter((e) => e.role === 'guest').length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore the guest's language across reloads and across the several times a guest
  // reopens the portal during a stay. Scoped per property so one device used at two
  // stays doesn't leak a choice between them. Falls back silently when storage is
  // unavailable (private mode, blocked storage) rather than breaking the portal.
  const langKey = `moche_lang_${propertyId}`;
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(langKey);
      if (saved && resolveLanguage(saved)) setLanguage(saved);
    } catch { /* storage unavailable — keep the auto default */ }
  }, [langKey]);

  const chooseLanguage = useCallback((code: string) => {
    setLanguage(code);
    setLangOpen(false);
    try { window.localStorage.setItem(langKey, code); } catch { /* best-effort */ }
  }, [langKey]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [entries, busy]);

  const categorySheetRef = useSheetDismiss({ active: !!activeCategory, onClose: () => setActiveCategory(null) });
  const hostComposerSheetRef = useSheetDismiss({ active: hostComposerOpen, onClose: () => setHostComposerOpen(false) });
  const serviceRequestSheetRef = useSheetDismiss({ active: srOpen, onClose: closeServiceRequest });
  const placeDetailSheetRef = useSheetDismiss({ active: !!placeDetailId, onClose: closePlaceDetail });

  function returnToPortalHome() {
    setActiveCategory(null);
    setHostComposerOpen(false);
    closeServiceRequest();
    closePlaceDetail();
    setLangOpen(false);
    scrollToPortalHome();
  }

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busy || sendInFlight.current) return;     
      sendInFlight.current = true;
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
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // The guest's chosen language rides along with every turn so the concierge
            // answers in it AND so any escalation is translated into the host's own
            // language server-side. 'auto' is omitted: the server then mirrors whatever
            // language the guest actually wrote in.
            body: JSON.stringify({
              message: text,
              ...(language !== AUTO_LANGUAGE ? { language } : {}),
            }),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'I could not answer just now.');
      const places: ChatPlaceRef[] = Array.isArray(json.places)
        ? json.places
            .filter((p: unknown): p is ChatPlaceRef => !!p && typeof p === 'object' && typeof (p as ChatPlaceRef).id === 'string')
            .slice(0, 4)
        : [];
      setEntries((e) => [...e, { role: 'assistant', content: json.answer, escalated: json.escalated, isEmergency: json.isEmergency, places }]);
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 3) : []);
    } catch (e) {
      setEntries((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.' }]);
          } finally { sendInFlight.current = false; setBusy(false); }
  }, [busy, entries, hostPreview, propertyId, slug, language]);

  // Add-on: one-tap feedback. Records a private product_feedback row (guest path).
  // A positive rating (4-5) is the signal that surfaces the Review Nudge when the host
  // has it enabled + set to auto. Best-effort POST — never blocks the concierge.
  // Records the rating immediately (one tap). An optional comment can follow via a second
  // call once the guest has rated; we send it as a distinct row so the host sees the note.
  const submitFeedback = useCallback(async (rating: number, comment?: string) => {
    const isFirst = feedbackState === 'idle';
    if (isFirst) {
      setFeedbackState('rated');
      if (rating >= 4 && reviewNudge.enabled && reviewNudge.auto && reviewNudgeState === 'hidden') {
        setReviewNudgeState('shown');
      }
    }
    if (hostPreview) return; // host preview has no guest session — don't write feedback
    const trimmed = comment?.trim();
    // On the first call we always record the rating. A follow-up call carries only a comment.
    if (!isFirst && !trimmed) return;
    try {
      await fetch(`/api/guest/${slug}/feedback`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, page: 'guest_portal', ...(trimmed ? { comment: trimmed } : {}) }),
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
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          ...(language !== AUTO_LANGUAGE ? { language } : {}),
        }),
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
  }, [hostSending, hostPreview, slug, language]);

  // "Report an issue" interview (WS-7). startServiceRequest fires the guest's first
  // free-text description; continueServiceRequest answers a follow-up question.
  // Both share response handling since /start and /message return the same shape.
  const handleSrTurn = useCallback((json: { id?: string; status: string; question?: string; choices?: string[] | null; guestMessage?: string; report?: { summary: string } }) => {
    if (json.id) setSrTicketId(json.id);
    setSrStatus(json.status as typeof srStatus);
    if (json.status === 'safety_escalated') {
      setSrTurns((t) => [...t, { role: 'assistant', text: json.guestMessage ?? 'We have flagged this for your host right away.' }]);
    } else if (json.status === 'completed') {
      setSrTurns((t) => [...t, { role: 'assistant', text: json.report?.summary ?? 'Got it — your report has been sent to your host.' }]);
    } else if (json.question) {
      setSrTurns((t) => [...t, { role: 'assistant', text: json.question!, choices: json.choices ?? null }]);
    }
  }, []);

  const startServiceRequest = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || srBusy) return;
    setSrTurns((t) => [...t, { role: 'guest', text: trimmed }]);
    setSrInput('');
    setSrBusy(true);
    setSrError(null);
    try {
      const res = await fetch(`/api/guest/${slug}/service-request/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not submit your report.');
      handleSrTurn(json);
    } catch (e) {
      setSrError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSrBusy(false);
    }
  }, [slug, srBusy, handleSrTurn]);

  const continueServiceRequest = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || srBusy || !srTicketId) return;
    setSrTurns((t) => [...t, { role: 'guest', text: trimmed }]);
    setSrInput('');
    setSrBusy(true);
    setSrError(null);
    const mediaKeys = srPendingMedia;
    setSrPendingMedia([]);
    try {
      const res = await fetch(`/api/guest/${slug}/service-request/${srTicketId}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, ...(mediaKeys.length ? { mediaKeys } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save your answer.');
      handleSrTurn(json);
    } catch (e) {
      setSrError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSrBusy(false);
    }
  }, [slug, srBusy, srTicketId, srPendingMedia, handleSrTurn]);

  const attachSrMedia = useCallback(async (file: File) => {
    if (!srTicketId || srUploading || srPendingMedia.length >= 5) return;
    setSrUploading(true);
    setSrError(null);
    try {
      const presignRes = await fetch(`/api/guest/${slug}/service-request/${srTicketId}/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, contentLengthBytes: file.size, fileName: file.name }),
      });
      const presigned = await presignRes.json();
      if (!presignRes.ok) throw new Error(presigned.error ?? 'Could not attach that file.');
      const putRes = await fetch(presigned.url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!putRes.ok) throw new Error('Upload failed. Please try again.');
      setSrPendingMedia((keys) => [...keys, presigned.key]);
    } catch (e) {
      setSrError(e instanceof Error ? e.message : 'Could not attach that file.');
    } finally {
      setSrUploading(false);
    }
  }, [slug, srTicketId, srUploading, srPendingMedia.length]);

  function closeServiceRequest() {
    setSrOpen(false);
    setSrTurns([]);
    setSrTicketId(null);
    setSrStatus('idle');
    setSrInput('');
    setSrError(null);
    setSrPendingMedia([]);
  }

  // WS-5 — open the place-detail sheet and fetch the server-verified record for the
  // tapped chip. Host preview has no guest session, so it degrades to a friendly
  // "not verified" message rather than hitting the session-gated guest endpoint.
  const placeDetailAbortRef = useRef<AbortController | null>(null);
const openPlaceDetail = useCallback((id: string) => {
    setPlaceDetailId(id);
    setPlaceDetail(null);
    setPlaceDetailError(null);
    if (hostPreview) {
      setPlaceDetailError('Place details are not available in host preview.');
      return;
    }
            setPlaceDetailLoading(true);
    placeDetailAbortRef.current?.abort();
    const controller = new AbortController();
    placeDetailAbortRef.current = controller;
    fetch(`/api/guest/${slug}/places/${id}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.verified) throw new Error('not_verified');
        if (placeDetailAbortRef.current === controller) setPlaceDetail(json.place as PlaceDetail);
      })
              .catch((err) => { if (err?.name !== 'AbortError' && placeDetailAbortRef.current === controller) setPlaceDetailError("We couldn't verify this place right now."); })
            .finally(() => { if (placeDetailAbortRef.current === controller) setPlaceDetailLoading(false); });
  }, [hostPreview, slug]);

  function closePlaceDetail() {
    setPlaceDetailId(null);
    placeDetailAbortRef.current?.abort();
    setPlaceDetail(null);
    setPlaceDetailError(null);
  }

  // Every refresh starts a clean chat; everything already said lives in Chat History.
  //
  // This effect used to replay the guest's most recent conversation section into the
  // chat box. Two passes of that behaviour showed the same problem: a guest who
  // reloads is almost always starting a NEW question, and they arrived to a box
  // pre-filled with a conversation they had already finished — which they then had to
  // scroll past to reach the input. Nothing is lost: every message is persisted
  // server-side and rendered, sectioned and titled, behind the Chat History chip.
  //
  // What the effect still does is seed the poll cursor and record that this stay HAS a
  // conversation, so a host reply that lands after the refresh still streams into the
  // live chat rather than being silently dropped.
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
        const usable = history.filter((m) => m.role === 'guest' || m.role === 'assistant' || m.role === 'host');
        if (usable.length === 0) return;
        lastSeenRef.current = usable[usable.length - 1]?.created_at ?? null;
        setHasPriorHistory(true);
      } catch { /* best-effort — a failed fetch just means no poll cursor */ }
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
          setEntries((e) => [...e, ...hostReplies.map((m) => ({ role: 'host' as const, content: m.content }))]);
        }
      } catch { /* best-effort polling */ }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [hostPreview, hasEscalation, slug]);

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
    if (choice.query === SERVICE_REQUEST) {
      closeServiceRequest();
      setTimeout(() => setSrOpen(true), 60);
      return;
    }
    send(choice.query);
  }

  function openCategory(cat: Category) {
    // Cards flagged `direct` skip the sub-choice sheet entirely. "Ask anything" is
    // the whole reason this exists: a guest who wants to type should be typing one
    // tap after they decide to, not choosing from a list of questions they didn't ask.
    if (cat.direct) {
      pickSubChoice({ label: cat.label, query: cat.direct });
      return;
    }
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
        {/* Language selector — occupies the slot the retired mute toggle used to hold.
            Shows the chosen language's own endonym ("Español", not "Spanish"), because
            a guest scanning for their language recognises it written their way. */}
        <button
          type="button"
          onClick={() => setLangOpen(true)}
          className="gp-lang"
          data-testid="button-language"
          aria-label="Change language"
          title="Change language"
        >
          <Globe size={15} aria-hidden />
          <span className="gp-lang-code">
            {language === AUTO_LANGUAGE ? 'Language' : languageNativeLabel(language)}
          </span>
        </button>
      </div>

      {/* ONE grid, every action. Guest card pass: the topic tiles, Extras, Report an
          issue and Message your host used to live in three separate blocks (.gp-cats,
          .gp-req-row, and a lone .gp-host-link), which produced ragged half-empty rows
          and a stray band of dead space where a card should have been. They are all the
          same thing to a guest — "a tappable way to get something" — so they are now one
          uniform grid. The trailing-odd rule in the stylesheet makes the last card span
          the row, so the grid can never end in a hole. Behaviour is unchanged; only the
          layout and the reachability of "Message your host" changed. */}
      <div style={{ fontSize: '.72rem', opacity: 0.5, margin: '.25rem .15rem .6rem', textTransform: 'uppercase', letterSpacing: '.14em' }}>How can we help?</div>
      <div className="gp-cats" data-testid="category-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => openCategory(cat)}
            className={`gp-cat gp-card${cat.primary ? ' gp-cat-primary' : ''}`}
            data-testid={`category-${cat.key}`}
          >
            <span className="gp-cat-icon"><cat.Icon size={20} aria-hidden /></span>
            <span className="gp-serif gp-cat-label">{cat.label}</span>
            <span className="gp-cat-sub">{cat.subtitle}</span>
          </button>
        ))}

        {extraOffers.length > 0 && (
          <button
            type="button"
            onClick={() => { window.location.assign(`/g/${slug}/extras`); }}
            className="gp-cat gp-card gp-cat-accent"
            data-testid="card-extras"
            aria-expanded={extrasOpen}
          >
            <span className="gp-cat-icon"><ShoppingCart size={20} aria-hidden /></span>
            <span className="gp-serif gp-cat-label">Extras</span>
            <span className="gp-cat-sub">Add something to your stay</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => { closeServiceRequest(); setTimeout(() => setSrOpen(true), 60); }}
          className="gp-cat gp-card"
          data-testid="card-report-issue"
        >
          <span className="gp-cat-icon"><Wrench size={20} aria-hidden /></span>
          <span className="gp-serif gp-cat-label">Report an issue</span>
          <span className="gp-cat-sub">Maintenance or service request</span>
        </button>

        {/* Message your host — promoted from a thin text link under the grid into a
            real card. It is one of the two most-wanted actions in the portal and was
            the least visible thing on the page. Still the same escalation flow: it
            opens the confirm-style composer, never pings the host on a stray tap. */}
        <button
          type="button"
          onClick={() => { setHostComposerError(null); setHostMsg(''); setHostComposerOpen(true); }}
          className="gp-cat gp-card gp-cat-accent"
          data-testid="button-service-bell"
          aria-label="Message your host directly"
        >
          <span className="gp-cat-icon"><UserRound size={20} aria-hidden /></span>
          <span className="gp-serif gp-cat-label">Message your host</span>
          <span className="gp-cat-sub">A real person replies to you</span>
        </button>
      </div>

      {/* Add-on: Extras — host-configured guest extras. Tapping a CTA routes
          through the existing escalation + notify() path so the host is alerted.
          Now revealed by the "Extras" card above rather than always inline. */}
      {extraOffers.length > 0 && extrasOpen && (
        <div ref={extrasRef}>
          <ExtrasSection slug={slug} offers={extraOffers} hostPreview={hostPreview} />
        </div>
      )}


      {/* RETIRED (Guest card pass): the standalone "Message your host directly" text
          link that used to sit here. It carried the same data-testid and the same
          handler, and has been promoted into the card grid above so it is discoverable
          rather than being the smallest, lowest-contrast target on the page.

        <button
          onClick={() => { setHostComposerError(null); setHostMsg(''); setHostComposerOpen(true); }}
          className="gp-host-link"
          data-testid="button-service-bell"
          aria-label="Message your host"
        >
          <UserRound size={15} aria-hidden /> Message your host directly
        </button>
      */}

      <div ref={chatRef} style={{ scrollMarginTop: '1rem' }}>
        <div ref={scrollRef} style={{ ...cardStyle, maxHeight: '48dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.85rem', padding: '1.1rem' }} data-testid="chat-view">
          {hasPriorHistory && (
            <div className="gp-chat-earlier" data-testid="chat-earlier-note">
              Everything you asked earlier is saved under <strong>Chat History</strong> at the top of the page.
            </div>
          )}
          {entries.map((m, i) => (
            <div key={i} className="gp-msg" style={{ display: 'flex', gap: '.5rem', alignSelf: m.role === 'guest' ? 'flex-end' : 'flex-start', maxWidth: '90%', flexDirection: m.role === 'guest' ? 'row-reverse' : 'row' }}>
              {m.role === 'assistant' && <span style={{ flexShrink: 0, marginTop: 2 }}><DomeMark size={26} /></span>}
              {m.role === 'host' && (
                <span style={{ flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, #e7d3a6, ${GOLD})`, color: '#1a1206' }} aria-hidden>
                  <UserRound size={15} />
                </span>
              )}
              <div>
                {/* Who is speaking, always named. The live chat used to label host
                    replies only, so a guest reading back through a thread could not
                    tell the concierge's answer from their host's. Both are labelled
                    now, matching the wording used in the history sheet. */}
                {m.role !== 'guest' && (
                  <div style={{ fontSize: '.7rem', fontWeight: 600, color: GOLD, marginBottom: '.2rem', letterSpacing: '.02em' }} data-testid={`msg-who-${m.role}-${i}`}>
                    {m.role === 'host' ? 'Your host' : 'Concierge'}
                  </div>
                )}
                <div style={m.role === 'guest' ? bubbleGuest : m.role === 'host' ? bubbleHost : bubbleAssistant} data-testid={`msg-${m.role}-${i}`}>
                  {m.isEmergency && (
                    <div style={{ fontWeight: 700, color: '#e6a15c', marginBottom: '.25rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      <AlertTriangle size={14} aria-hidden /> For emergencies, contact local services first.
                    </div>
                  )}
                  {/* Answers routinely contain a booking URL, the host's number, or a
                      maps link. Rendering them as inert text made the guest retype
                      them by hand. linkify() only ever promotes http(s)/mailto/tel and
                      always labels the anchor with the literal source text, so a model
                      cannot mint a link target that differs from what the guest reads. */}
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {linkify(m.content).map((seg, si) =>
                      seg.kind === 'link' ? (
                        <a
                          key={si}
                          href={seg.href}
                          className="gp-inline-link"
                          target={seg.linkKind === 'url' ? '_blank' : undefined}
                          rel={seg.linkKind === 'url' ? 'noopener noreferrer nofollow' : undefined}
                          data-testid={`msg-link-${i}-${si}`}
                        >
                          {seg.label}
                        </a>
                      ) : (
                        <span key={si}>{seg.value}</span>
                      ),
                    )}
                  </div>
                </div>
                {m.places && m.places.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.4rem' }}>
                    {m.places.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openPlaceDetail(p.id)}
                        className="gp-place-chip"
                        data-testid={`place-chip-${p.id}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '.3rem', border: `1px solid ${GOLD}55`,
                          background: 'rgba(201,169,110,0.1)', color: 'inherit', borderRadius: 999,
                          padding: '.32rem .65rem .32rem .55rem', fontSize: '.78rem', cursor: 'pointer', lineHeight: 1.2,
                        }}
                      >
                        <MapPin size={12} aria-hidden style={{ color: GOLD, flexShrink: 0 }} />
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
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

      {/* Persistent AI disclosure (EU AI Act Art. 50) — a compact, always-visible line
          with an expandable "How this works" detail, placed right next to the chat
          input where guests are about to type. Never hidden behind hover; the toggle
          is a real focusable button with visible text at all times. */}
      <div style={{ marginTop: '1.1rem' }}><AiDisclosure variant="banner" /></div>

      {/* De-emphasized free-text input — kept available but secondary to the cards.
          The send action is the concierge service bell: tapping it rings the concierge
          and submits the message. */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) send(input); }}
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

      {/* Language sheet — the Globe's destination. Same portaled bottom-sheet pattern
          as every other sheet here (a transformed .gp-rise ancestor would otherwise
          trap position:fixed). Scrollable, searchable, and labelled in each language's
          own script. */}
      {mounted && langOpen && createPortal(
        <LanguageSheet
          current={language}
          onPick={chooseLanguage}
          onClose={() => setLangOpen(false)}
          onHome={returnToPortalHome}
        />,
        document.body,
      )}

      {/* Sub-choice slide-over — pre-formed options that instantly trigger the chat.
          Portaled to document.body so position:fixed resolves against the viewport and
          the sheet pins to the bottom of the screen (not below the tapped card). */}
      {mounted && activeCategory && createPortal(
        <div className="gp-sheet-scrim" onClick={() => setActiveCategory(null)} data-testid="subchoice-overlay">
          <div ref={categorySheetRef} tabIndex={-1} className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${activeCategory.label} options`} data-testid={`subchoice-${activeCategory.key}`}>
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><activeCategory.Icon size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">{activeCategory.label}</div>
                <div className="gp-sheet-sub">{activeCategory.subtitle}</div>
              </div>
              <button type="button" onClick={returnToPortalHome} className="gp-sheet-home" data-testid="button-portal-home-subchoice">
                <Home size={15} aria-hidden /> Portal home
              </button>
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
          <div ref={hostComposerSheetRef} tabIndex={-1} className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Message your host" data-testid="host-composer">
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><UserRound size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">Message your host</div>
                <div className="gp-sheet-sub">Type your question or issue — we&rsquo;ll pass it straight to them.</div>
              </div>
              <button type="button" onClick={returnToPortalHome} className="gp-sheet-home" data-testid="button-portal-home-host-composer">
                <Home size={15} aria-hidden /> Portal home
              </button>
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
                  border: '1px solid rgba(255,255,255,0.14)', background: '#171c25',
                  color: '#fbf7ef', WebkitTextFillColor: '#fbf7ef', padding: '.7rem .85rem', fontSize: '.92rem', lineHeight: 1.45,
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

      {/* "Report an issue" interview panel (WS-7): a guided, turn-by-turn intake distinct
          from the free-text "Message the host" composer above. Safety triage on the
          server can short-circuit straight to a "we've alerted your host" message. */}
      {mounted && srOpen && createPortal(
        <div className="gp-sheet-scrim" onClick={() => !srBusy && closeServiceRequest()} data-testid="service-request-overlay">
          <div ref={serviceRequestSheetRef} tabIndex={-1} className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Report an issue" data-testid="service-request-panel">
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><Wrench size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">Report an issue</div>
                <div className="gp-sheet-sub">
                  {srStatus === 'idle' && 'Tell us what\u2019s wrong \u2014 we\u2019ll ask a couple of quick follow-ups.'}
                  {srStatus === 'in_progress' && 'Just a couple more details.'}
                  {srStatus === 'completed' && 'Sent to your host.'}
                  {srStatus === 'safety_escalated' && 'Your host has been alerted right away.'}
                </div>
              </div>
              <button type="button" onClick={returnToPortalHome} className="gp-sheet-home" data-testid="button-portal-home-service-request">
                <Home size={15} aria-hidden /> Portal home
              </button>
              <button onClick={() => !srBusy && closeServiceRequest()} className="gp-sheet-close" data-testid="button-close-service-request" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', padding: '.25rem .2rem .2rem', maxHeight: '46vh', overflowY: 'auto' }}>
              {srTurns.map((turn, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: turn.role === 'guest' ? 'flex-end' : 'flex-start' }}>
                  <div style={turn.role === 'guest' ? bubbleGuest : bubbleAssistant}>{turn.text}</div>
                </div>
              ))}
              {srBusy && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={bubbleAssistant}><Loader2 size={14} aria-hidden className="gp-spin" /></div>
                </div>
              )}
            </div>

            {srStatus === 'completed' || srStatus === 'safety_escalated' ? (
              <div style={{ padding: '.6rem .2rem .2rem' }}>
                <div style={alertOk} data-testid="service-request-confirmation">
                  <CheckCircle2 size={14} aria-hidden style={{ marginRight: '.35rem', verticalAlign: '-2px' }} />
                  {srStatus === 'completed' ? 'Your report has been sent to your host.' : 'Your host has been notified right away.'}
                </div>
                <button type="button" onClick={closeServiceRequest} className="gp-bell-send" style={{ width: '100%', height: 'auto', padding: '.7rem 1rem', borderRadius: 12 }} data-testid="button-close-service-request-done">
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); if (!srInput.trim()) return; srTicketId ? continueServiceRequest(srInput) : startServiceRequest(srInput); }}
                style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', padding: '.6rem .2rem .2rem' }}
              >
                {srError && <div style={alertErr}>{srError}</div>}

                {!!srTurns.length && srTurns[srTurns.length - 1]?.choices?.length ? (
                  <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                    {srTurns[srTurns.length - 1]!.choices!.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={srBusy}
                        onClick={() => continueServiceRequest(c)}
                        className="gp-subchoice"
                        data-testid={`service-request-choice-${c}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end' }}>
                  <textarea
                    autoFocus
                    value={srInput}
                    onChange={(e) => setSrInput(e.target.value)}
                    rows={srTurns.length === 0 ? 4 : 2}
                    maxLength={srTicketId ? 1000 : 2000}
                    disabled={srBusy}
                    placeholder={srTicketId ? 'Type your answer\u2026' : "For example: The kitchen faucet won't stop dripping."}
                    data-testid="input-service-request"
                    style={mutedInputStyle}
                  />
                </div>

                {srTicketId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <input
                      ref={srFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) attachSrMedia(f); e.target.value = ''; }}
                      data-testid="input-service-request-media"
                    />
                    <button
                      type="button"
                      className="gp-sheet-close"
                      disabled={srUploading || srPendingMedia.length >= 5}
                      onClick={() => srFileInputRef.current?.click()}
                      aria-label="Attach a photo"
                      data-testid="button-attach-service-request-media"
                    >
                      {srUploading ? <Loader2 size={16} aria-hidden className="gp-spin" /> : <Paperclip size={16} aria-hidden />}
                    </button>
                    {srPendingMedia.length > 0 && (
                      <span className="faint" style={{ fontSize: '.76rem' }}>{srPendingMedia.length} attached</span>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="gp-bell-send"
                  disabled={srBusy || !srInput.trim()}
                  data-testid="button-send-service-request"
                  style={{ width: '100%', height: 'auto', padding: '.75rem 1rem', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.45rem', fontWeight: 600 }}
                >
                  <Send size={16} aria-hidden /> {srBusy ? 'Sending\u2026' : (srTicketId ? 'Send answer' : 'Send report')}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}

      {mounted && !!placeDetailId && createPortal(
        <div className="gp-sheet-scrim" onClick={closePlaceDetail} data-testid="place-detail-overlay">
          <div ref={placeDetailSheetRef} tabIndex={-1} className="gp-sheet gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Place details" data-testid="place-detail-panel">
            <div className="gp-sheet-grip" aria-hidden />
            <div className="gp-sheet-head">
              <span className="gp-cat-icon gp-sheet-badge"><MapPin size={22} aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gp-serif gp-sheet-title">{placeDetail?.name ?? 'Place details'}</div>
                {placeDetail && (
                  <div className="gp-sheet-sub">
                    {placeDetail.hostFavorite ? 'Host favorite' : NEARBY_CATEGORY_LABEL[placeDetail.category] ?? placeDetail.category}
                    {typeof placeDetail.distanceM === 'number' && ` \u00b7 ${formatDistance(placeDetail.distanceM)}`}
                  </div>
                )}
              </div>
              <button type="button" onClick={returnToPortalHome} className="gp-sheet-home" data-testid="button-portal-home-place-detail">
                <Home size={15} aria-hidden /> Portal home
              </button>
              <button onClick={closePlaceDetail} className="gp-sheet-close" data-testid="button-close-place-detail" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', padding: '.6rem .2rem .2rem' }}>
              {placeDetailLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.2rem 0' }}>
                  <Loader2 size={20} aria-hidden className="gp-spin" />
                </div>
              )}

              {placeDetailError && (
                <div style={alertErr} data-testid="place-detail-error">{placeDetailError}</div>
              )}

              {placeDetail && !placeDetailLoading && (
                <>
                  {placeDetail.hostNote && (
                    <div style={{ fontSize: '.88rem', lineHeight: 1.5, background: 'rgba(201,169,110,0.08)', border: `1px solid ${GOLD}33`, borderRadius: 12, padding: '.6rem .75rem' }}>
                      <span style={{ fontWeight: 600, color: GOLD }}>Host note: </span>{placeDetail.hostNote}
                    </div>
                  )}
                  {placeDetail.address && (
                    <div style={{ fontSize: '.86rem', opacity: 0.85, display: 'flex', alignItems: 'flex-start', gap: '.4rem' }}>
                      <MapPin size={14} aria-hidden style={{ flexShrink: 0, marginTop: 2, color: GOLD }} />
                      <span>{placeDetail.address}</span>
                    </div>
                  )}
                  {(placeDetail.rating != null || placeDetail.priceLevel != null) && (
                    <div style={{ fontSize: '.86rem', opacity: 0.85 }}>
                      {placeDetail.rating != null && `\u2605 ${placeDetail.rating.toFixed(1)}`}
                      {placeDetail.rating != null && placeDetail.reviewCount != null && ` (${placeDetail.reviewCount})`}
                      {placeDetail.rating != null && placeDetail.priceLevel != null && '  \u00b7  '}
                      {placeDetail.priceLevel != null && '$'.repeat(Math.max(1, placeDetail.priceLevel))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    {placeDetail.mapsUrl && (
                      <a
                        href={placeDetail.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gp-bell-send"
                        data-testid="button-place-detail-maps"
                        style={{ height: 'auto', padding: '.6rem .95rem', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <MapPin size={15} aria-hidden /> Open in Maps
                      </a>
                    )}
                    {placeDetail.telHref && (
                      <a
                        href={placeDetail.telHref}
                        className="gp-sheet-close"
                        data-testid="button-place-detail-call"
                        style={{ width: 'auto', height: 'auto', padding: '.6rem .95rem', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: '.4rem', textDecoration: 'none', color: 'inherit' }}
                      >
                        <Phone size={15} aria-hidden /> Call
                      </a>
                    )}
                    {placeDetail.websiteUrl && (
                      <a
                        href={placeDetail.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gp-sheet-close"
                        data-testid="button-place-detail-website"
                        style={{ width: 'auto', height: 'auto', padding: '.6rem .95rem', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: '.4rem', textDecoration: 'none', color: 'inherit' }}
                      >
                        <Globe size={15} aria-hidden /> Website
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
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
        /* Guest UX pass — the card grid was ONE full-width column on mobile with
           1.12rem labels and 38px icons, so seven tall cards plus the request row
           meant a guest scrolled roughly three screens before reaching the chat.
           It is now a two-column grid at every width with a denser card, which
           puts the whole card set plus the chat box within about one screen.
           grid-auto-rows:1fr keeps every card the same height so the grid reads
           as a deliberate set rather than a ragged stack. */
        .gp-cats,
        .gp-req-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-auto-flow: dense;
          grid-auto-rows: 1fr;
          align-items: stretch;
          gap: .55rem;
        }
        @media (min-width: 561px) {
          .gp-cats, .gp-req-row { gap: .75rem; }
          .gp-cats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        /* No holes at the end of the grid. With an odd number of cards the last one
           would otherwise sit alone beside a rectangle of empty page, which is exactly
           the "random section space where a card should be" this pass set out to kill.
           A lone trailing card takes the whole row instead and reads as intentional.
           Two selectors because the column count changes at the breakpoint: at 2 cols
           the orphan is an odd-numbered last child; at 3 cols it is a 3n+1 last child. */
        .gp-cats > :last-child:nth-child(odd) { grid-column: 1 / -1; }
        @media (min-width: 561px) {
          .gp-cats > :last-child:nth-child(odd) { grid-column: auto; }
          .gp-cats > :last-child:nth-child(3n + 1) { grid-column: 1 / -1; }
          .gp-cats > :nth-last-child(2):nth-child(3n + 1) { grid-column: span 2; }
        }
        /* Extras and Message your host are the two cards that reach a human or a
           purchase rather than an instant answer, so they carry a faint gold wash to
           separate them from the five informational tiles without shouting. */
        .gp-cat-accent {
          background: linear-gradient(135deg, rgba(201,169,110,.15), rgba(201,169,110,.04));
          border-color: rgba(201,169,110,.4);
        }
        .gp-cat-accent .gp-cat-icon { background: rgba(201,169,110,.2); }
        /* RETIRED (Guest card pass) — .gp-cat-primary, the full-width gold wash that
           belonged to the "Ask anything" card. That card was removed (see CATEGORIES),
           and the trailing-orphan rule above now handles full-width spanning. Kept per
           the "nothing is deleted" rule in case a future primary tile wants it back.

        .gp-cat-primary {
          grid-column: 1 / -1;
          background: linear-gradient(135deg, rgba(201,169,110,.16), rgba(201,169,110,.05));
          border-color: rgba(201,169,110,.42);
          flex-direction: row; align-items: center; gap: .7rem;
        }
        .gp-cat-primary .gp-cat-icon { margin-bottom: 0; }
        .gp-cat-primary .gp-cat-label { font-size: 1.02rem; }
        .gp-cat-primary .gp-cat-sub { display: block; }
        */
        .gp-cat {
          display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: .08rem;
          min-width: 0; min-height: 88px; padding: var(--pad-card); cursor: pointer; text-align: left; color: inherit;
          transition: transform .2s cubic-bezier(.16,1,.3,1), border-color .2s, background .2s, box-shadow .2s;
        }
        @media (min-width: 561px) { .gp-cat { padding: var(--pad-card); min-height: 104px; } }
        .gp-cat:hover {
          transform: translateY(-3px); border-color: rgba(201,169,110,.5);
          box-shadow: 0 14px 34px -18px rgba(201,169,110,.7);
        }
        .gp-cat:active { transform: translateY(-1px); }
        .gp-cat-icon {
          display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
          margin-bottom: .42rem; color: ${GOLD}; flex-shrink: 0;
          background: rgba(201,169,110,.12); border: 1px solid rgba(201,169,110,.22);
        }
        @media (min-width: 561px) { .gp-cat-icon { width: 38px; height: 38px; border-radius: 11px; } }
        .gp-cat-label { font-size: .92rem; font-weight: 600; line-height: 1.15; color: #f3ede1; }
        @media (min-width: 561px) { .gp-cat-label { font-size: 1.05rem; } }
        /* The subtitle is the first thing to go on a narrow phone: at two columns it
           wraps to three lines and doubles card height for very little added meaning.
           It returns as soon as there is room for it. */
        .gp-cat-sub { font-size: .7rem; opacity: .55; display: none; line-height: 1.3; }
        @media (min-width: 421px) { .gp-cat-sub { display: block; } }
        /* Change 2 & 3 — Extras / Report-an-issue cards: same visual family as .gp-cat
           (via shared classNames) but laid out as a standalone row so they read as their
           own clearly-tappable surfaces rather than part of the conversational grid. */
        .gp-req-row { margin-top: .9rem; }
        .gp-req-card { min-height: 44px; }
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
        /* RETIRED with the chime: .gp-mute (34px circular speaker toggle). Kept
           commented per the "nothing is deleted" rule.
           .gp-mute {
             flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; color: #ece7dd;
             border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04);
             display: grid; place-items: center; opacity: .7; transition: opacity .18s, transform .18s, background .18s;
           }
           .gp-mute:hover { opacity: 1; transform: translateY(-1px); background: rgba(255,255,255,.07); } */

        /* Language control — a pill rather than the old bare circle, because the
           current language has to be readable at a glance; an unlabelled globe would
           leave a guest unsure whether their choice took effect. 34px keeps it in the
           presence bar; the tap target is widened by padding, not by height. */
        .gp-lang {
          flex-shrink: 0; min-height: 34px; border-radius: 999px; cursor: pointer; color: #ece7dd;
          border: 1px solid rgba(201,169,110,.3); background: rgba(201,169,110,.08);
          display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .7rem;
          font-size: .74rem; font-weight: 600; opacity: .82;
          transition: opacity .18s, transform .18s, background .18s, border-color .18s;
        }
        .gp-lang:hover {
          opacity: 1; transform: translateY(-1px);
          background: rgba(201,169,110,.14); border-color: rgba(201,169,110,.5);
        }
        .gp-lang-code { max-width: 8.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gp-lang-search {
          display: flex; align-items: center; gap: .5rem; margin: .2rem 0 .6rem;
          padding: .6rem .8rem; border-radius: 12px;
          border: 1px solid rgba(255,255,255,.14); background: #171c25;
        }
        /* The language search box was unreadable on mobile: a guest typed and saw
           nothing. Two causes, both fixed here.
           1. The sheets are portaled to document.body, which puts them OUTSIDE
              .gp-root — the only element carrying colorScheme:'dark'. Form controls
              inside them therefore fell back to the UA's LIGHT scheme and painted
              near-white text on the near-black .gp-lang-search background.
           2. iOS Safari ignores plain 'color' on an input and honours only
              -webkit-text-fill-color, which this rule never set.
           color-scheme is declared on the scrim and the sheet (below) so every control
           in every portaled sheet inherits the dark scheme, not just this one. */
        .gp-lang-search input {
          flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
          color: #fbf7ef; -webkit-text-fill-color: #fbf7ef; caret-color: ${GOLD};
          font-size: 16px; /* under 16px iOS Safari zooms the viewport on focus */
          opacity: 1;
        }
        .gp-lang-search input::placeholder { color: rgba(251,247,239,.45); -webkit-text-fill-color: rgba(251,247,239,.45); opacity: 1; }
        .gp-lang-search:hover { background: #1b202a; border-color: rgba(201,169,110,.38); }
        .gp-lang-search:focus-within { border-color: rgba(201,169,110,.7); box-shadow: 0 0 0 3px rgba(201,169,110,.2); }
        /* Small, quiet note at the top of a resumed chat, pointing at where the earlier
           conversation went. Not a bubble — it is chrome, not a message. */
        .gp-chat-earlier {
          font-size: .74rem; line-height: 1.4; opacity: .6; text-align: center;
          padding: .1rem .4rem .35rem; border-bottom: 1px solid rgba(255,255,255,.07);
        }
        .gp-chat-earlier strong { color: ${GOLD}; font-weight: 600; }
        /* Capped height with its own scroll: 40+ languages must never push the sheet
           past the viewport or hijack the page scroll behind it. */
        .gp-lang-list {
          display: flex; flex-direction: column; gap: .2rem;
          max-height: 52dvh; overflow-y: auto; -webkit-overflow-scrolling: touch;
          margin: 0 -.25rem; padding: 0 .25rem;
        }
        .gp-lang-row {
          display: flex; align-items: center; gap: .6rem; width: 100%; min-height: 46px;
          padding: .6rem .75rem; border-radius: 12px; cursor: pointer; text-align: left;
          border: 1px solid transparent; background: transparent; color: inherit;
          transition: background .16s, border-color .16s;
        }
        .gp-lang-row:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); }
        .gp-lang-row-on { background: rgba(201,169,110,.12); border-color: rgba(201,169,110,.35); }
        .gp-lang-native { flex: 1; min-width: 0; font-size: .92rem; color: #f3ede1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gp-lang-en { font-size: .74rem; opacity: .5; flex-shrink: 0; }
        .gp-lang-empty { padding: 1.2rem .75rem; font-size: .84rem; opacity: .6; text-align: center; }

        /* Conversation history sheet. Taller than the other sheets because scanning a
           stay's worth of conversations is its entire job. */
        .gp-history-sheet { max-height: 88dvh; display: flex; flex-direction: column; }
        .gp-history-body {
          display: flex; flex-direction: column; gap: .45rem;
          overflow-y: auto; -webkit-overflow-scrolling: touch;
          margin: .2rem -.25rem 0; padding: 0 .25rem .4rem;
        }
        .gp-history-note {
          display: flex; align-items: center; justify-content: center; gap: .45rem;
          padding: 1.6rem 1rem; font-size: .86rem; opacity: .62; text-align: center; line-height: 1.5;
        }
        .gp-history-section {
          border: 1px solid rgba(255,255,255,.09); border-radius: 14px;
          background: rgba(255,255,255,.025); overflow: hidden;
        }
        /* Threads a real person answered get the gold treatment the rest of the portal
           reserves for human contact, so they are findable at a glance in a long list. */
        .gp-history-section-host {
          border-color: rgba(201,169,110,.32);
          background: rgba(201,169,110,.05);
        }
        .gp-history-hostbadge {
          display: inline-flex; align-items: center; gap: .28rem; align-self: flex-start;
          margin: .1rem 0 .05rem; padding: .1rem .42rem;
          border-radius: 999px; border: 1px solid rgba(201,169,110,.35);
          background: rgba(201,169,110,.1); color: ${GOLD};
          font-size: .66rem; letter-spacing: .04em; line-height: 1.5; white-space: nowrap;
        }
        .gp-history-head {
          display: flex; align-items: center; gap: .6rem; width: 100%; min-height: 52px;
          padding: .7rem .85rem; cursor: pointer; text-align: left;
          border: 0; background: transparent; color: inherit; transition: background .16s;
        }
        .gp-history-head:hover { background: rgba(255,255,255,.04); }
        .gp-history-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .15rem; }
        .gp-history-title {
          font-size: .95rem; font-weight: 600; color: #f3ede1; line-height: 1.2;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gp-history-preview {
          font-size: .74rem; opacity: .5; line-height: 1.25;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gp-history-chev { flex-shrink: 0; opacity: .5; transition: transform .18s ease; }
        .gp-history-msgs {
          display: flex; flex-direction: column; gap: .55rem;
          padding: .1rem .85rem .85rem; border-top: 1px solid rgba(255,255,255,.07);
          animation: gpFade .2s ease both;
        }
        .gp-history-msg { display: flex; flex-direction: column; gap: .12rem; padding-top: .55rem; }
        .gp-history-who {
          font-size: .66rem; text-transform: uppercase; letter-spacing: .1em; opacity: .45; font-weight: 600;
        }
        .gp-history-msg-guest .gp-history-who { color: ${GOLD}; opacity: .75; }
        .gp-history-msg-host .gp-history-who { color: ${GOLD}; opacity: .9; }
        .gp-history-text { font-size: .86rem; line-height: 1.5; color: #e8e3d9; white-space: pre-wrap; overflow-wrap: anywhere; }

        /* Inline links inside concierge answers. Underlined rather than colour-only so
           they are distinguishable without relying on colour perception. */
        .gp-inline-link {
          color: ${GOLD}; text-decoration: underline; text-underline-offset: 2px;
          text-decoration-color: rgba(201,169,110,.55); overflow-wrap: anywhere;
        }
        .gp-inline-link:hover { text-decoration-color: ${GOLD}; }
        /* color-scheme is the fix for every "I can't see what I'm typing" report in a
           bottom sheet. Sheets are portaled to document.body, outside .gp-root, so they
           never inherited the dark scheme the portal sets inline — UA-painted form
           controls (text, caret, autofill, spinners) came out light-on-dark. Declaring
           it here covers every current and future sheet, not just the language search. */
        .gp-sheet-scrim {
          position: fixed; inset: 0; z-index: 50; background: rgba(6,8,12,.6); backdrop-filter: blur(4px);
          display: flex; align-items: flex-end; justify-content: center; padding: 0;
          animation: gpFade .25s ease both;
          color-scheme: dark;
        }
        .gp-sheet-scrim input, .gp-sheet-scrim textarea, .gp-sheet-scrim select {
          color: #fbf7ef; -webkit-text-fill-color: #fbf7ef; caret-color: ${GOLD};
        }
        .gp-sheet-scrim input::placeholder, .gp-sheet-scrim textarea::placeholder {
          color: rgba(251,247,239,.45); -webkit-text-fill-color: rgba(251,247,239,.45); opacity: 1;
        }
        .gp-sheet-scrim input:-webkit-autofill,
        .gp-sheet-scrim textarea:-webkit-autofill,
        .gp-sheet-scrim select:-webkit-autofill {
          -webkit-box-shadow: inset 0 0 0 1000px #171c25;
          -webkit-text-fill-color: #fbf7ef;
          caret-color: ${GOLD};
        }
        .gp-sheet-scrim input:focus-visible,
        .gp-sheet-scrim textarea:focus-visible,
        .gp-sheet-scrim select:focus-visible,
        .gp-sheet button:focus-visible,
        .gp-sheet a:focus-visible {
          outline: 3px solid #e7d3a6;
          outline-offset: 2px;
        }
        @media (min-width: 560px) { .gp-sheet-scrim { align-items: center; padding: 1rem; } }
        .gp-sheet {
          width: 100%; max-width: 560px; border-radius: 22px 22px 0 0;
          padding: 1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom));
          animation: gpSheetUp .34s cubic-bezier(.16,1,.3,1) both;
          color-scheme: dark;
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
        .gp-sheet-home {
          display: inline-flex; align-items: center; gap: .3rem; min-height: 36px; padding: .35rem .55rem;
          border-radius: 999px; cursor: pointer; color: #fbf7ef; flex-shrink: 0; font-size: .72rem; font-weight: 600;
          border: 1px solid rgba(201,169,110,.4); background: rgba(201,169,110,.1);
        }
        .gp-sheet-home:hover { background: rgba(201,169,110,.18); border-color: rgba(201,169,110,.7); }
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
        .gp-place-chip { transition: border-color .18s, background .18s, transform .12s; }
        .gp-place-chip:hover { border-color: ${GOLD}99; background: rgba(201,169,110,0.18); }
        .gp-place-chip:active { transform: scale(.97); }
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
        .gp-spin { animation: gpSpin .8s linear infinite; }
        @keyframes gpSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .gp-spin { animation: none; } }
        @keyframes gpBlink { 0%, 60%, 100% { opacity: .25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @keyframes gpMsg { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes gpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gpSheetUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .gp-dot, .gp-typing, .gp-msg, .gp-pills, .gp-sheet, .gp-sheet-scrim { animation: none; }
          .gp-cat:hover, .gp-pill:hover, .gp-bell-send:hover:not(:disabled), .gp-subchoice:hover,
          .gp-lang:hover, .gp-brandchip-btn:hover { transform: none; }
          .gp-history-msgs, .gp-history-chev { animation: none; transition: none; }
        }
      `}</style>
    </div>
  );
}

// TCPA / consent fine print shown at the point of opt-in. Mirrors the host-side notice.
const GUEST_NOTIFY_FINE_PRINT =
  'By tapping Notify me you agree to receive a one-time automated message (SMS or email) from ' +
  'Moche-AI when your host replies. Message & data rates may apply. Reply STOP to opt out. ' +
  'Consent is not a condition of any service.';

// 4c — inline soft-gate. Captures a contact + explicit consent and posts to the
// notify-consent endpoint, which stores it on the guest's verified session row.
/**
 * Language picker (Guest UX pass). Replaces the retired mute toggle in the presence bar.
 *
 * Two deliberate choices:
 *  - Every language is listed by its endonym first ("Espanol", "Portugues", "Tieng Viet").
 *    A guest scanning for their language looks for it written the way they write it, not
 *    for the English exonym.
 *  - "Match my message" is the default and stays pinned at the top. Most guests never
 *    need to touch this; the concierge already mirrors whatever language they type in.
 *    The explicit picker exists for the guest who wants to READ in their language while
 *    typing in imperfect English, which the auto behaviour can't infer.
 */
function LanguageSheet({ current, onPick, onClose, onHome }: {
  current: string;
  onPick: (code: string) => void;
  onClose: () => void;
  onHome: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? searchLanguages(query) : PORTAL_LANGUAGES), [query]);
  const sheetRef = useSheetDismiss({ active: true, onClose });

  return (
    <div className="gp-sheet-scrim" onClick={onClose} data-testid="language-overlay">
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="gp-sheet gp-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your language"
        data-testid="language-sheet"
      >
        <div className="gp-sheet-grip" aria-hidden />
        <div className="gp-sheet-head">
          <span className="gp-cat-icon gp-sheet-badge"><Globe size={22} aria-hidden /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="gp-serif gp-sheet-title">Language</div>
            <div className="gp-sheet-sub">Your concierge will reply in it</div>
          </div>
          <button type="button" onClick={onHome} className="gp-sheet-home" data-testid="button-portal-home-language">
            <Home size={15} aria-hidden /> Portal home
          </button>
          <button onClick={onClose} className="gp-sheet-close" data-testid="button-close-language" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="gp-lang-search">
          <Search size={15} aria-hidden style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search languages"
            aria-label="Search languages"
            data-testid="input-language-search"
            autoComplete="off"
          />
        </div>

        <div className="gp-lang-list" data-testid="language-list">
          <button
            type="button"
            onClick={() => onPick(AUTO_LANGUAGE)}
            className={`gp-lang-row${current === AUTO_LANGUAGE ? ' gp-lang-row-on' : ''}`}
            data-testid="language-option-auto"
          >
            <span className="gp-lang-native">Match my message</span>
            <span className="gp-lang-en">Automatic</span>
            {current === AUTO_LANGUAGE && <Check size={16} aria-hidden style={{ color: GOLD, flexShrink: 0 }} />}
          </button>

          {results.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => onPick(lang.code)}
              className={`gp-lang-row${current === lang.code ? ' gp-lang-row-on' : ''}`}
              data-testid={`language-option-${lang.code}`}
              lang={lang.code}
            >
              <span className="gp-lang-native">{lang.nativeLabel}</span>
              <span className="gp-lang-en">{lang.label}</span>
              {current === lang.code && <Check size={16} aria-hidden style={{ color: GOLD, flexShrink: 0 }} />}
            </button>
          ))}

          {results.length === 0 && (
            <div className="gp-lang-empty" data-testid="language-empty">
              No match for &ldquo;{query.trim()}&rdquo;. Try the language&apos;s English name.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Conversation history (Guest UX pass).
 *
 * History used to be replayed inside the chat box, which meant a guest on day four
 * opened the portal to days one through three and had to scroll past all of it. It now
 * lives behind the Moche.AI pill: a full-height sheet of collapsible sections split on
 * a 45-minute conversational gap, each with a title derived from the guest's opening
 * question so the list is scannable rather than a flat transcript.
 *
 * This component fetches its own data on open. That is intentional: the sheet is opened
 * from the hero (outside <Concierge>), and giving it its own fetch avoids lifting chat
 * state up through the whole portal for a panel most guests open rarely, if ever.
 */
function ChatHistorySheet({ slug, onClose, onHome }: { slug: string; onClose: () => void; onHome: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sections, setSections] = useState<HistorySection[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const sheetRef = useSheetDismiss({ active: mounted, onClose });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/guest/${slug}/messages`);
        if (!res.ok) throw new Error('unavailable');
        const json = await res.json();
        const raw = ((json.messages ?? []) as { role: string; content: string; created_at: string }[])
          .filter((m) => m.role === 'guest' || m.role === 'assistant' || m.role === 'host')
          .map((m): HistoryMessage => ({
            role: m.role as HistoryMessage['role'],
            content: m.content,
            created_at: m.created_at,
          }));
        if (cancelled) return;
        // Newest conversation first — a guest looking something up almost always wants
        // the most recent exchange, not the first one of the stay.
        const built = sectionizeHistory(raw).reverse();
        setSections(built);
        // Expand the most recent section so the sheet is never a wall of closed rows.
        setOpenIds(new Set(built.length > 0 ? [built[0].id] : []));
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="gp-sheet-scrim" onClick={onClose} data-testid="chat-history-overlay">
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="gp-sheet gp-card gp-history-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your conversation history"
        data-testid="chat-history-sheet"
      >
        <div className="gp-sheet-grip" aria-hidden />
        <div className="gp-sheet-head">
          <span className="gp-cat-icon gp-sheet-badge"><DomeMark size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="gp-serif gp-sheet-title">Your conversations</div>
            <div className="gp-sheet-sub">Everything you have asked during this stay</div>
          </div>
          <button type="button" onClick={onHome} className="gp-sheet-home" data-testid="button-portal-home-history">
            <Home size={15} aria-hidden /> Portal home
          </button>
          <button onClick={onClose} className="gp-sheet-close" data-testid="button-close-history" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="gp-history-body">
          {state === 'loading' && (
            <div className="gp-history-note" data-testid="history-loading">
              <Loader2 size={15} aria-hidden className="gp-spin" /> Loading your conversations…
            </div>
          )}

          {state === 'error' && (
            <div className="gp-history-note" data-testid="history-error">
              We could not load your history just now. Your current conversation is still open behind this panel.
            </div>
          )}

          {state === 'ready' && sections.length === 0 && (
            <div className="gp-history-note" data-testid="history-empty">
              Nothing here yet. Ask your concierge a question and it will show up in this list.
            </div>
          )}

          {state === 'ready' && sections.map((section) => {
            const open = openIds.has(section.id);
            // A conversation a real person joined is the one a guest actually comes
            // back looking for — "what did the host say about the parking?" — so it is
            // marked in the collapsed list rather than only being discoverable by
            // opening every section in turn.
            const withHost = section.messages.some((m) => m.role === 'host');
            return (
              <div
                key={section.id}
                className={`gp-history-section${withHost ? ' gp-history-section-host' : ''}`}
                data-testid={`history-section-${section.id}`}
                data-host-thread={withHost ? 'true' : undefined}
              >
                <button
                  type="button"
                  className="gp-history-head"
                  onClick={() => toggle(section.id)}
                  aria-expanded={open}
                  data-testid={`history-toggle-${section.id}`}
                >
                  <span className="gp-history-meta">
                    <span className="gp-serif gp-history-title">{section.title}</span>
                    {withHost && (
                      <span className="gp-history-hostbadge" data-testid={`history-host-badge-${section.id}`}>
                        <UserRound size={11} aria-hidden /> Your host replied
                      </span>
                    )}
                    <span className="gp-history-preview">{sectionPreview(section)}</span>
                  </span>
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className="gp-history-chev"
                    style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                  />
                </button>

                {open && (
                  <div className="gp-history-msgs">
                    {section.messages.map((m, i) => (
                      <div
                        key={`${section.id}-${i}`}
                        className={`gp-history-msg gp-history-msg-${m.role}`}
                        data-testid={`history-msg-${m.role}-${i}`}
                      >
                        <span className="gp-history-who">
                          {m.role === 'guest' ? 'You' : m.role === 'host' ? 'Your host' : 'Concierge'}
                        </span>
                        <span className="gp-history-text">
                          {linkify(m.content).map((seg, si) =>
                            seg.kind === 'link' ? (
                              <a
                                key={si}
                                href={seg.href}
                                className="gp-inline-link"
                                target={seg.linkKind === 'url' ? '_blank' : undefined}
                                rel={seg.linkKind === 'url' ? 'noopener noreferrer nofollow' : undefined}
                              >
                                {seg.label}
                              </a>
                            ) : (
                              <span key={si}>{seg.value}</span>
                            ),
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NotifyMeCard({ slug, onSaved, onSkip }: { slug: string; onSaved: () => void; onSkip: () => void }) {
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
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
    <div style={{ ...cardStyle, marginTop: '.9rem' }} className="gp-card gp-rise" data-testid="notify-me-card">
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

// Add-on: Extras — host-configured guest extras rendered as frosted cards.
// Tapping the CTA routes through the EXISTING escalation + notify() path (the same
// mechanism the chat route uses for low-confidence questions) so the host is alerted
// in-app, by email, and (Pro+, consented) by SMS. No new guest channel is invented.
// Guest visibility is intentionally NOT gated — the host creating an offer is the opt-in.
function ExtrasSection({ slug, offers, hostPreview }: { slug: string; offers: ExtraOffer[]; hostPreview: boolean }) {
  // Per-offer request state so each offer independently reflects idle/sending/done.
  // Preserved from the previous inline-list version: a guest who requested one
  // extra should still see it marked as requested after browsing elsewhere.
  const [state, setState] = useState<Record<string, 'idle' | 'busy' | 'done' | 'error'>>({});

  // Grouped once per offer list. Ordering is `is_favorite DESC, category ASC,
  // name ASC`, applied in lib/guest/extras.ts so it cannot drift from the tests.
  const groups = useMemo(() => groupExtrasByCategory(offers), [offers]);
  const singleGroup = groups.length === 1;

  // Navigation: tiles -> item list -> detail. With only one category there is
  // nothing to choose, so the tile step is skipped entirely rather than shown as
  // a lone button a guest has to tap for no reason.
  const [openCategory, setOpenCategory] = useState<string | null>(singleGroup ? groups[0].category.id : null);
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(DEFAULT_EXTRA_QUANTITY);
  const [note, setNote] = useState('');
  // Which concrete variant the guest picked ("Blue bike" vs "Pink bike"). Null until
  // they choose, which is also what gates the request button for offers that define
  // options: a host who bothered to list variants should never get an order that
  // doesn't say which one.
  const [variant, setVariant] = useState<string | null>(null);
  const [variantError, setVariantError] = useState(false);

  const activeGroup: ExtrasGroup<ExtraOffer> | null =
    groups.find((g) => g.category.id === openCategory) ?? null;
  const openOffer = openOfferId ? offers.find((o) => o.id === openOfferId) ?? null : null;

  const openDetail = useCallback((offer: ExtraOffer) => {
    setOpenOfferId(offer.id);
    setQuantity(DEFAULT_EXTRA_QUANTITY);
    setNote('');
    // Preselect when there is only one variant — presenting a "choice" of one is
    // busywork, but the order still needs to record which variant it was.
    const opts = normalizeExtraOptions(offer.options);
    setVariant(opts.length === 1 ? opts[0] : null);
    setVariantError(false);
    // Clear a stale error so a retry starts from a clean panel.
    setState((s) => (s[offer.id] === 'error' ? { ...s, [offer.id]: 'idle' } : s));
  }, []);

  const request = useCallback(async (offer: ExtraOffer, qty: number, message: string, chosenVariant: string | null) => {
    const offerId = offer.id;
    if (state[offerId] === 'busy') return;
    const opts = normalizeExtraOptions(offer.options);
    if (opts.length > 0 && !chosenVariant) { setVariantError(true); return; }
    setVariantError(false);
    // Packages are one bundle, not a countable item, so the quantity is pinned to 1
    // here as well as server-side — the stepper isn't even rendered for them.
    const safeQty = isPackageExtra(offer.kind) ? 1 : clampExtraQuantity(qty, offer.max_quantity);
    // Host preview is read-only — reflect success without creating a real escalation.
    if (hostPreview) { setState((s) => ({ ...s, [offerId]: 'done' })); return; }
    setState((s) => ({ ...s, [offerId]: 'busy' }));
    try {
      const res = await fetch(`/api/guest/${slug}/extras-request`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offerId,
          quantity: safeQty,
          ...(chosenVariant ? { variant: chosenVariant } : {}),
          ...(message.trim() ? { note: message.trim().slice(0, 1000) } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      setState((s) => ({ ...s, [offerId]: 'done' }));
    } catch {
      setState((s) => ({ ...s, [offerId]: 'error' }));
    }
  }, [hostPreview, slug, state]);

  const detailState = openOffer ? state[openOffer.id] ?? 'idle' : 'idle';
  const ceiling = openOffer ? extraQuantityCeiling(openOffer.max_quantity) : 1;
  const detailOptions = openOffer ? normalizeExtraOptions(openOffer.options) : [];
  const detailIsPackage = openOffer ? isPackageExtra(openOffer.kind) : false;

  return (
    <section style={{ marginTop: '1.5rem' }} data-testid="extras-section">
      {/* RETIRED (Extras imagery pass) — the "Elevate your stay" glass banner. It was a
          decorative strip of marketing copy sitting between the guest and the thing they
          tapped for, and it carried the section's only photograph. Real per-category
          imagery now does that job on the tiles themselves, where it actually helps a
          guest recognise what is on offer. Kept per the "nothing is deleted" rule.

        <PremiumImage
          src="/premium/enhancements-banner.jpg"
          alt=""
          aspectRatio="21 / 6"
          radius={16}
          sizes="(max-width: 720px) 100vw, 720px"
          className="gp-extra-banner"
        >
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '.9rem 1.1rem', background: 'linear-gradient(to top, rgba(13,15,20,.75), transparent 70%)' }}>
            <span className="gp-serif" style={{ fontSize: '1.25rem', color: '#fbf7ef' }}>Elevate your stay</span>
          </div>
        </PremiumImage>
      */}

      {/* Breadcrumb-style back control. One step back at a time so the guest is
          never dropped out of the flow by a single tap. */}
      {(openOffer || (activeGroup && !singleGroup)) && (
        <button
          type="button"
          className="gp-extra-back"
          onClick={() => { if (openOffer) setOpenOfferId(null); else setOpenCategory(null); }}
          data-testid="button-extras-back"
        >
          <ChevronLeft size={15} aria-hidden />
          {openOffer ? (activeGroup?.category.label ?? 'Extras') : 'All extras'}
        </button>
      )}

      <div style={{ fontSize: '.72rem', opacity: 0.5, margin: '.7rem .15rem .6rem', textTransform: 'uppercase', letterSpacing: '.14em' }}>
        {openOffer ? 'Request an extra' : activeGroup ? activeGroup.category.label : 'Browse by category'}
      </div>

      {/* --- Step 3: detail + quantity ------------------------------------ */}
      {openOffer ? (
        <div style={cardStyle} className="gp-card" data-testid={`extra-detail-${openOffer.id}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.6rem' }}>
            <span className="gp-serif" style={{ fontSize: '1.25rem', color: '#fbf7ef', lineHeight: 1.2 }}>{openOffer.title}</span>
            {openOffer.price_text && (
              <span style={{ color: GOLD, fontWeight: 600, fontSize: '.9rem', flexShrink: 0 }}>{openOffer.price_text}</span>
            )}
          </div>
          {openOffer.description && (
            <p style={{ opacity: 0.7, fontSize: '.88rem', margin: '.45rem 0 0', lineHeight: 1.5 }}>{openOffer.description}</p>
          )}

          {detailState === 'done' ? (
            <div data-testid={`extra-confirmation-${openOffer.id}`} style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: GOLD, fontWeight: 600, fontSize: '.9rem' }}>
                <CheckCircle2 size={18} aria-hidden /> Request sent
              </div>
              <p style={{ opacity: 0.7, fontSize: '.85rem', margin: '.45rem 0 .9rem', lineHeight: 1.45 }}>
                Your host has it and will follow up to confirm availability and the price. Nothing has been charged.
              </p>
              <button
                type="button"
                className="gp-extra-cta"
                onClick={() => { setOpenOfferId(null); if (!singleGroup) setOpenCategory(null); }}
                data-testid="button-extras-browse-more"
              >
                Browse more extras
              </button>
            </div>
          ) : (
            <>
              {/* What exactly the guest is getting. Hosts write this so the offer is
                  unambiguous before it is requested — what's included, lead time,
                  exclusions — rather than leaving the guest to ask in chat. */}
              {openOffer.details && (
                <div className="gp-extra-details" data-testid={`extra-details-${openOffer.id}`}>
                  {openOffer.details}
                </div>
              )}

              {/* Variant picker. This is the difference between "a bike" and "the blue
                  bike": the host listed distinct things, so the guest chooses one
                  rather than describing it in the free-text note and hoping. */}
              {detailOptions.length > 0 && (
                <fieldset className="gp-variant" data-testid={`extra-variants-${openOffer.id}`}>
                  <legend className="gp-qty-label">{openOffer.option_label?.trim() || 'Choose an option'}</legend>
                  <div className="gp-variant-row">
                    {detailOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`gp-variant-chip${variant === opt ? ' gp-variant-chip-on' : ''}`}
                        onClick={() => { setVariant(opt); setVariantError(false); }}
                        aria-pressed={variant === opt}
                        disabled={detailState === 'busy'}
                        data-testid={`extra-variant-${opt}`}
                      >
                        {variant === opt && <Check size={13} aria-hidden style={{ flexShrink: 0 }} />}
                        {opt}
                      </button>
                    ))}
                  </div>
                  {variantError && (
                    <p className="gp-variant-error" data-testid="extra-variant-error">
                      Pick one so your host knows exactly what to bring.
                    </p>
                  )}
                </fieldset>
              )}

              {/* A package is a single bookable bundle — a golf package, a wedding
                  package — so a stepper would invite a nonsensical "3 wedding
                  packages". Countable items keep the stepper. */}
              {detailIsPackage ? (
                <div className="gp-package-note" data-testid={`extra-package-note-${openOffer.id}`}>
                  <Package size={15} aria-hidden style={{ color: GOLD, flexShrink: 0 }} />
                  <span>Booked as one package for your stay.</span>
                </div>
              ) : (
              <div className="gp-qty-row">
                <span className="gp-qty-label" id={`qty-label-${openOffer.id}`}>
                  How many{openOffer.unit_label?.trim() ? ` ${openOffer.unit_label.trim()}` : ''}?
                </span>
                <div className="gp-qty" role="group" aria-labelledby={`qty-label-${openOffer.id}`}>
                  <button
                    type="button"
                    className="gp-qty-btn"
                    onClick={() => setQuantity((q) => clampExtraQuantity(q - 1, openOffer.max_quantity))}
                    disabled={quantity <= DEFAULT_EXTRA_QUANTITY || detailState === 'busy'}
                    aria-label="Decrease quantity"
                    data-testid="button-extra-qty-down"
                  >
                    <Minus size={16} aria-hidden />
                  </button>
                  <output className="gp-qty-value" aria-live="polite" data-testid="extra-qty-value">{quantity}</output>
                  <button
                    type="button"
                    className="gp-qty-btn"
                    onClick={() => setQuantity((q) => clampExtraQuantity(q + 1, openOffer.max_quantity))}
                    disabled={quantity >= ceiling || detailState === 'busy'}
                    aria-label="Increase quantity"
                    data-testid="button-extra-qty-up"
                  >
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
              </div>
              )}
              {!detailIsPackage && quantity >= ceiling && (
                <p style={{ fontSize: '.74rem', opacity: 0.55, margin: '.5rem 0 0' }} data-testid="extra-qty-ceiling">
                  {ceiling} is the most you can request here. Ask your host in chat if you need more.
                </p>
              )}

              <label className="gp-qty-label" htmlFor={`extra-note-${openOffer.id}`} style={{ display: 'block', margin: '1rem 0 .4rem' }}>
                Anything your host should know? (optional)
              </label>
              <textarea
                id={`extra-note-${openOffer.id}`}
                className="gp-extra-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Timing, preferences, allergies…"
                disabled={detailState === 'busy'}
                data-testid="input-extra-note"
              />

              {/* Restate the order in plain words right above the button, so the guest
                  confirms "2 extra towels, blue" rather than a bare quantity. */}
              <p style={{ fontSize: '.78rem', opacity: 0.6, margin: '.7rem 0 .9rem', lineHeight: 1.45 }} data-testid="extra-advisory">
                {detailIsPackage
                  ? 'Your host will confirm availability and the price. Nothing is charged now.'
                  : `${quantitySummary(quantity, openOffer.unit_label)}${variant ? ` · ${variant}` : ''} — ${quantityAdvisory(quantity)}`}
              </p>

              <button
                type="button"
                onClick={() => request(openOffer, quantity, note, variant)}
                className="gp-extra-cta"
                disabled={detailState === 'busy'}
                data-testid={`button-extra-request-${openOffer.id}`}
              >
                {detailState === 'busy' ? 'Sending…' : (<><Plus size={15} aria-hidden /> {openOffer.cta_label || 'Request'}</>)}
              </button>

              {detailState === 'error' && (
                <div style={{ ...alertErr, marginTop: '.8rem', marginBottom: 0 }} data-testid={`extra-error-${openOffer.id}`}>
                  Couldn&apos;t send that just now. Please try again.
                </div>
              )}
            </>
          )}
        </div>
      ) : activeGroup ? (
        /* --- Step 2: items in the chosen category ----------------------- */
        <div className="gp-extras" data-testid={`extras-items-${activeGroup.category.id}`}>
          {activeGroup.items.map((offer) => {
            const st = state[offer.id] ?? 'idle';
            return (
              <button
                key={offer.id}
                type="button"
                onClick={() => openDetail(offer)}
                style={{ ...gridCardStyle, textAlign: 'left', width: '100%', cursor: 'pointer' }}
                className="gp-card gp-extra-item"
                data-testid={`extra-offer-${offer.id}`}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.6rem' }}>
                  <span className="gp-serif" style={{ fontSize: '1.1rem', color: '#fbf7ef', lineHeight: 1.2 }}>{offer.title}</span>
                  {offer.price_text && (
                    <span style={{ color: GOLD, fontWeight: 600, fontSize: '.85rem', flexShrink: 0 }}>{offer.price_text}</span>
                  )}
                </span>
                {offer.description && (
                  <span style={{ display: 'block', opacity: 0.65, fontSize: '.83rem', margin: '.35rem 0 0', lineHeight: 1.45 }}>{offer.description}</span>
                )}
                {/* Surface the choice up front so a guest can see there IS a choice
                    before they commit a tap to the detail panel. */}
                {(() => {
                  const opts = normalizeExtraOptions(offer.options);
                  const pkg = isPackageExtra(offer.kind);
                  if (!pkg && opts.length === 0) return null;
                  return (
                    <span className="gp-extra-tags" data-testid={`extra-tags-${offer.id}`}>
                      {pkg && <span className="gp-extra-tag"><Package size={11} aria-hidden /> Package</span>}
                      {opts.slice(0, 3).map((o) => <span key={o} className="gp-extra-tag">{o}</span>)}
                      {opts.length > 3 && <span className="gp-extra-tag">+{opts.length - 3} more</span>}
                    </span>
                  );
                })()}
                <span className="gp-extra-item-foot">
                  {st === 'done' ? (
                    <><Check size={14} aria-hidden /> Requested</>
                  ) : (
                    <>{offer.cta_label || 'Request'} <ChevronRight size={14} aria-hidden /></>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* --- Step 1: category tiles ------------------------------------- */
        /* Image-led tiles. A list of category NAMES asked a guest to imagine what
           "Arrival & departure" contains; a photograph tells them in one glance, and it
           is what makes this section feel like part of the property rather than a form.
           Every image is a local asset served through PremiumImage, which paints a
           gold-tinted dark gradient underneath — so a missing or slow file degrades to
           a deliberate-looking card instead of a broken one. */
        <div className="gp-extras gp-extras-cats" data-testid="extras-categories">
          {groups.map((group) => {
            const requested = group.items.filter((i) => (state[i.id] ?? 'idle') === 'done').length;
            return (
              <button
                key={group.category.id}
                type="button"
                onClick={() => setOpenCategory(group.category.id)}
                style={{ textAlign: 'left', width: '100%', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                className="gp-card gp-extra-item gp-extra-cat"
                data-testid={`extras-category-${group.category.id}`}
              >
                <PremiumImage
                  src={`/premium/extras/${group.category.id}.jpg`}
                  alt=""
                  aspectRatio="16 / 9"
                  radius={0}
                  sizes="(max-width: 560px) 100vw, 360px"
                  className="gp-extra-cat-img"
                >
                  <span className="gp-extra-cat-veil" aria-hidden />
                  <span className="gp-extra-cat-count">
                    {group.items.length} {group.items.length === 1 ? 'option' : 'options'}
                  </span>
                </PremiumImage>
                <span className="gp-extra-cat-body">
                  <span className="gp-serif" style={{ display: 'block', fontSize: '1.1rem', color: '#fbf7ef', lineHeight: 1.2 }}>{group.category.label}</span>
                  <span style={{ display: 'block', opacity: 0.65, fontSize: '.83rem', margin: '.3rem 0 0', lineHeight: 1.45 }}>{group.category.hint}</span>
                  <span className="gp-extra-item-foot">
                    {requested > 0 ? (<><Check size={14} aria-hidden /> {requested} requested</>) : (<>Browse <ChevronRight size={14} aria-hidden /></>)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .gp-extras {
          display: grid; grid-template-columns: minmax(0, 1fr); gap: .55rem;
          grid-auto-flow: dense; grid-auto-rows: 1fr; align-items: stretch;
        }
        /* Image-led category tiles. The photo is edge-to-edge at the top of the card
           and the copy sits beneath it, so the tile reads like a listing card rather
           than a form row. The card itself owns the rounding and clips the image. */
        .gp-extras-cats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 561px) { .gp-extras-cats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        /* Two class names so this beats the generic .gp-extra-item { display: block }
           rule declared further down the sheet. */
        .gp-extra-item.gp-extra-cat { display: flex; flex-direction: column; padding: 0; }
        .gp-extra-cat :global(.gp-extra-cat-img) { width: 100%; flex-shrink: 0; }
        /* Warm scrim so the gold count chip and the card edge stay legible over any
           photograph, however bright its corner happens to be. */
        .gp-extra-cat-veil {
          position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(to top, rgba(13,15,20,.9), rgba(13,15,20,.12) 62%, rgba(13,15,20,.3));
        }
        .gp-extra-cat-count {
          position: absolute; right: .5rem; top: .5rem; z-index: 1;
          padding: .18rem .5rem; border-radius: 999px; font-size: .68rem; line-height: 1.4;
          color: #f4e9d2; background: rgba(13,15,20,.72);
          border: 1px solid rgba(201,169,110,.4); backdrop-filter: blur(6px);
          white-space: nowrap;
        }
        .gp-extra-cat-body {
          display: flex; flex-direction: column; flex: 1;
          padding: var(--pad-card);
        }
        .gp-extra-cat .gp-extra-item-foot { margin-top: auto; padding-top: .55rem; }
        @media (min-width: 561px) {
          .gp-extras { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
          .gp-extras:not(.gp-extras-cats) > :last-child:nth-child(odd) { grid-column: 1 / -1; }
        }
        /* Same no-orphan rule the main card grid uses: a lone trailing tile takes the
           whole row rather than leaving a hole beside it. */
        .gp-extras-cats > :last-child:nth-child(odd) { grid-column: 1 / -1; }
        @media (min-width: 561px) {
          .gp-extras-cats > :last-child:nth-child(odd) { grid-column: auto; }
          .gp-extras-cats > :last-child:nth-child(3n + 1) { grid-column: 1 / -1; }
        }
        .gp-extra-item { display: block; min-width: 0; min-height: 100%; padding: var(--pad-card); }
        .gp-extra-details {
          margin: .75rem 0 0; padding: .7rem .85rem; border-radius: 12px;
          border: 1px solid rgba(201,169,110,.2); background: rgba(201,169,110,.06);
          font-size: .83rem; line-height: 1.5; opacity: .85; white-space: pre-wrap;
        }
        .gp-variant { border: 0; padding: 0; margin: 1rem 0 0; min-width: 0; }
        .gp-variant-row { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .45rem; }
        .gp-variant-chip {
          display: inline-flex; align-items: center; gap: .3rem; min-height: 40px;
          padding: .5rem .85rem; border-radius: 999px; cursor: pointer; font-size: .84rem;
          border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04); color: #ece7dd;
          transition: background .16s, border-color .16s, color .16s;
        }
        .gp-variant-chip:hover:not(:disabled) { border-color: rgba(201,169,110,.45); background: rgba(201,169,110,.08); }
        .gp-variant-chip-on {
          border-color: ${GOLD}; background: rgba(201,169,110,.18); color: #fbf7ef; font-weight: 600;
        }
        .gp-variant-chip:disabled { opacity: .5; cursor: not-allowed; }
        .gp-variant-error { font-size: .76rem; color: #e6a15c; margin: .45rem 0 0; }
        .gp-package-note {
          display: flex; align-items: center; gap: .45rem; margin: 1rem 0 0;
          padding: .6rem .8rem; border-radius: 12px; font-size: .83rem;
          border: 1px solid rgba(201,169,110,.24); background: rgba(201,169,110,.08);
        }
        .gp-extra-tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .5rem; }
        .gp-extra-tag {
          display: inline-flex; align-items: center; gap: .25rem;
          padding: .18rem .5rem; border-radius: 999px; font-size: .68rem; line-height: 1.4;
          border: 1px solid rgba(201,169,110,.28); background: rgba(201,169,110,.09); color: #e2d7bf;
        }
        .gp-extra-item-foot {
          display: inline-flex; align-items: center; gap: .3rem; margin-top: .75rem;
          font-size: .8rem; font-weight: 600; color: ${GOLD};
        }
        .gp-extra-back {
          display: inline-flex; align-items: center; gap: .25rem; margin-top: .85rem;
          min-height: 44px; padding: .5rem .75rem .5rem .4rem; border: none; background: none;
          color: inherit; opacity: .7; font-size: .82rem; font-weight: 600; cursor: pointer;
        }
        .gp-extra-back:hover { opacity: 1; }
        .gp-qty-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 1rem; margin-top: 1.1rem; flex-wrap: wrap;
        }
        .gp-qty-label { font-size: .82rem; opacity: .75; font-weight: 600; }
        .gp-qty {
          display: inline-flex; align-items: center; gap: .25rem;
          border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: .2rem;
        }
        .gp-qty-btn {
          width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
          display: grid; place-items: center; color: inherit;
          background: rgba(255,255,255,.06); transition: background .18s, opacity .18s;
        }
        .gp-qty-btn:hover:not(:disabled) { background: rgba(255,255,255,.12); }
        .gp-qty-btn:disabled { opacity: .35; cursor: default; }
        .gp-qty-value {
          min-width: 2.25rem; text-align: center; font-size: 1rem; font-weight: 700;
          color: #fbf7ef; font-variant-numeric: tabular-nums;
        }
        .gp-extra-note {
          width: 100%; box-sizing: border-box; padding: .65rem .8rem; font: inherit;
          font-size: .88rem; color: #fbf7ef; -webkit-text-fill-color: #fbf7ef; border-radius: 12px; resize: vertical;
          border: 1px solid rgba(255,255,255,.14); background: #1b202a;
        }
        .gp-extra-note::placeholder { color: rgba(236,231,221,.62); opacity: 1; }
        .gp-extra-note:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        .gp-extra-cta {
          display: inline-flex; align-items: center; gap: .4rem; padding: .6rem 1rem;
          min-height: 44px; border-radius: 999px; cursor: pointer; font-size: .85rem; font-weight: 600;
          color: #1a1206; border: none; background: linear-gradient(145deg, #e7d3a6, ${GOLD});
          transition: transform .18s, box-shadow .18s, opacity .18s;
        }
        .gp-extra-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px -14px rgba(201,169,110,.9); }
        .gp-extra-cta:disabled { opacity: .7; cursor: default; }
        @media (prefers-reduced-motion: reduce) {
          .gp-extra-cta:hover:not(:disabled) { transform: none; }
        }
      `}</style>
    </section>
  );
}

// Add-on: Review nudge — a tasteful, dismissible invitation to leave a review. Shown at
// most once per session (visibility governed by the caller's reviewNudgeState). The CTA
// opens the host-configured review URL in a new tab. Never blocks the concierge.
function ReviewNudgeCard({ url, propertyName, onDismiss }: { url: string; propertyName: string; onDismiss: () => void }) {
  return (
    <div style={{ ...cardStyle, marginTop: '.9rem' }} className="gp-card gp-rise" data-testid="review-nudge-card">
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
function FeedbackWidget({ state, onRate }: { state: 'idle' | 'rated'; onRate: (rating: number, comment?: string) => void }) {
  const [hover, setHover] = useState(0);
  const [rated, setRated] = useState(0);
  const [comment, setComment] = useState('');
  const [commentSent, setCommentSent] = useState(false);

  // Phase 2: after a rating is recorded, invite an optional comment. Fully skippable —
  // the rating is already saved, so this never blocks and adds no friction.
  if (state === 'rated') {
    if (commentSent) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.9rem', fontSize: '.8rem', opacity: 0.7 }} data-testid="feedback-thanks">
          <Check size={15} aria-hidden style={{ color: GOLD }} /> Thanks — your host will see this.
        </div>
      );
    }
    return (
      <div style={{ marginTop: '.9rem' }} data-testid="feedback-comment">
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', opacity: 0.7, marginBottom: '.5rem' }}>
          <Check size={15} aria-hidden style={{ color: GOLD }} /> Thanks for rating. Anything you&apos;d like to add?
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (comment.trim()) onRate(rated || 5, comment); setCommentSent(true); }}
          style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="Optional — tell your host what worked (or didn't)"
            data-testid="input-feedback-comment"
            style={{ ...mutedInputStyle, minWidth: 0, flex: '1 1 220px' }}
          />
          <button
            type="submit"
            data-testid="button-feedback-comment-send"
            style={{ padding: '.55rem .9rem', borderRadius: 12, border: 'none', background: `linear-gradient(145deg, #e7d3a6, ${GOLD})`, color: '#1a1206', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}
          >
            {comment.trim() ? 'Send' : 'Done'}
          </button>
        </form>
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
            onClick={() => { setRated(n); onRate(n); }}
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
const cardStyle: React.CSSProperties = { position: 'relative', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: 'var(--pad-card)', backdropFilter: 'blur(12px)', boxShadow: '0 20px 50px -30px rgba(0,0,0,.8)' };
const gridCardStyle: React.CSSProperties = { ...cardStyle, padding: undefined };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', opacity: 0.7, marginBottom: '.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.8rem .9rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: '#1b202a', color: '#fbf7ef', WebkitTextFillColor: '#fbf7ef', caretColor: '#e7d3a6', fontSize: '1rem', marginBottom: '1rem', outline: 'none' };
const mutedInputStyle: React.CSSProperties = { flex: 1, padding: '.7rem .9rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: '#171c25', color: '#fbf7ef', WebkitTextFillColor: '#fbf7ef', caretColor: '#e7d3a6', fontSize: '.9rem', outline: 'none' };
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
