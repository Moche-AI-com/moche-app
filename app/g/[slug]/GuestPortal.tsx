'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { CodeEntry } from './CodeEntry';
import { RegisterForm } from './RegisterForm';
import { MainMenu } from './MainMenu';
import { AiChatWorkflow } from './AiChatWorkflow';
import { HostChatWorkflow } from './HostChatWorkflow';
import { MaintenanceWorkflow } from './MaintenanceWorkflow';
import { ExtrasWorkflow, type GuestExtraOffer } from './ExtrasWorkflow';

import { useCallback as _uc, useEffect as _ue, useRef as _ur } from 'react';

// Accessibility: one reusable dismissal hook shared by every portaled sheet.
// Handles keyboard (Escape to close, Tab focus-trap), scroll-lock, and focus restore.
export function useSheetDismiss(open: boolean, onClose: () => void) {
  const containerRef = _ur<HTMLDivElement | null>(null);
  const handleKey = _uc(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );
  _ue(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    containerRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      if (previouslyFocused) previouslyFocused.focus();
    };
  }, [open, handleKey]);
  return containerRef;
}

// Stable testable ids for the six portaled sheets, one persistent home route each.
export const PORTAL_HOME_BUTTON_IDS = [
  'button-portal-home-subchoice',
  'button-portal-home-host-composer',
  'button-portal-home-service-request',
  'button-portal-home-place-detail',
  'button-portal-home-language',
  'button-portal-home-history',
] as const;

// Persistent "return to portal home" control rendered inside every portaled sheet.
// Each sheet type gets a stable, testable id: button-portal-home-<sheet>.
export function SheetHomeButton(props: { sheet: string; onHome: () => void }) {
  return (
    <button
      type="button"
      data-testid={`button-portal-home-${props.sheet}`}
      className="gp-back gp-sheet-home"
      onClick={props.onHome}
    >
      Portal home
    </button>
  );
}

export type PortalStep = 'code' | 'register' | 'menu' | 'ask' | 'host' | 'maintenance' | 'extras';

// Enhanced guest portal shell: a step machine covering
//   code entry → registration → main menu → one of four workflows.
// All workflow screens share the chrome defined here (back-to-menu, brand vars).
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
  initialRegistered: boolean;
  extrasOffers: GuestExtraOffer[];
  accessToken: string | null;
}) {
  const [step, setStep] = useState<PortalStep>(() => {
    if (!props.initialVerified) return 'code';
    if (props.hostPreview || props.initialRegistered) return 'menu';
    return 'register';
  });
  const [guestName, setGuestName] = useState<string | null>(props.guestName);

  const goMenu = useCallback(() => setStep('menu'), []);
  const goCode = useCallback(() => setStep('code'), []);
  const openHostChat = useCallback(() => setStep('host'), []);

  const brandVars = {
    '--gp-primary': props.brandPrimary ?? '#33E6D4',
    '--gp-accent': props.brandAccent ?? '#FF8A5C',
  } as CSSProperties;

  const showHero = step === 'code' || step === 'register';

  return (
    <div className={`gp-v2 ${props.fontClassName}`} style={brandVars}>
      <style>{PORTAL_CSS}</style>
      <div className="gp-wrap">
        <header className="gp-header">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" className="gp-logo" />
          ) : null}
          <div>
            <div className="gp-property-name">{props.propertyName}</div>
            {props.location ? <div className="gp-property-loc">{props.location}</div> : null}
          </div>
        </header>

        {showHero && props.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.coverImageUrl} alt="" className="gp-hero" />
        ) : null}

        <main className="gp-main">
          {step === 'code' && (
            <CodeEntry
              slug={props.slug}
              accessToken={props.accessToken}
              onVerified={(registered, name) => {
                if (name) setGuestName(name);
                setStep(registered ? 'menu' : 'register');
              }}
            />
          )}

          {step === 'register' && (
            <RegisterForm
              slug={props.slug}
              propertyName={props.propertyName}
              onRegistered={(name) => {
                setGuestName(name);
                setStep('menu');
              }}
              onSessionExpired={goCode}
            />
          )}

          {step === 'menu' && (
            <MainMenu
              propertyName={props.propertyName}
              guestName={guestName}
              hostPreview={props.hostPreview}
              onSelect={(key) => setStep(key)}
            />
          )}

          {step === 'ask' && (
            <AiChatWorkflow
              slug={props.slug}
              propertyId={props.propertyId}
              hostPreview={props.hostPreview}
              onBack={goMenu}
              onOpenHostChat={openHostChat}
              onSessionExpired={goCode}
            />
          )}

          {step === 'host' && (
            <HostChatWorkflow
              slug={props.slug}
              guestName={guestName}
              onBack={goMenu}
              onSessionExpired={goCode}
            />
          )}

          {step === 'maintenance' && (
            <MaintenanceWorkflow slug={props.slug} onBack={goMenu} onSessionExpired={goCode} />
          )}

          {step === 'extras' && (
            <ExtrasWorkflow
              slug={props.slug}
              offers={props.extrasOffers}
              onBack={goMenu}
              onSessionExpired={goCode}
            />
          )}
        </main>

        <footer className="gp-footer">Powered by Moche AI</footer>
      </div>
    </div>
  );
}

// Scoped portal styles. Everything hangs off .gp-v2 so nothing leaks into the
// host dashboard or marketing pages.
const PORTAL_CSS = `
.gp-v2 {
  min-height: 100dvh;
  background: #0b0f0e;
  color: #f2f5f4;
  font-family: var(--font-portal-sans), system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.gp-wrap {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.gp-header { display: flex; align-items: center; gap: 12px; padding: 8px 0 16px; }
.gp-logo { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
.gp-property-name { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.35rem; font-weight: 600; }
.gp-property-loc { font-size: 0.85rem; opacity: 0.65; }
.gp-hero { width: 100%; height: 160px; object-fit: cover; border-radius: 16px; margin-bottom: 16px; }
.gp-main { flex: 1; display: flex; flex-direction: column; }
.gp-footer { text-align: center; font-size: 0.75rem; opacity: 0.45; padding-top: 24px; }

.gp-step-title { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.6rem; font-weight: 600; margin: 8px 0 4px; }
.gp-step-sub { font-size: 0.95rem; opacity: 0.7; margin-bottom: 20px; line-height: 1.45; }

.gp-card { background: #131a18; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px; }

.gp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 12px; padding: 14px 18px; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%; transition: transform 0.05s ease, opacity 0.15s ease; }
.gp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gp-btn-primary { background: var(--gp-primary); color: #06201c; }
.gp-btn-accent { background: var(--gp-accent); color: #2a1408; }
.gp-btn-ghost { background: rgba(255,255,255,0.07); color: inherit; }

.gp-field { margin-bottom: 14px; }
.gp-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; opacity: 0.85; }
.gp-input, .gp-textarea { width: 100%; background: #0f1514; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; color: inherit; padding: 13px 14px; font-size: 1rem; outline: none; box-sizing: border-box; }
.gp-input:focus, .gp-textarea:focus { border-color: var(--gp-primary); }
.gp-textarea { min-height: 90px; resize: vertical; font-family: inherit; }
.gp-field-error { color: #ff9d8a; font-size: 0.82rem; margin-top: 5px; }

.gp-code-row { display: flex; gap: 10px; justify-content: center; margin: 18px 0 8px; }
.gp-code-box { width: 58px; height: 68px; text-align: center; font-size: 1.9rem; font-weight: 700; background: #0f1514; border: 1.5px solid rgba(255,255,255,0.16); border-radius: 14px; color: inherit; outline: none; }
.gp-code-box:focus { border-color: var(--gp-primary); }
.gp-error { background: rgba(255, 107, 84, 0.12); border: 1px solid rgba(255, 107, 84, 0.4); color: #ffb4a3; border-radius: 12px; padding: 11px 14px; font-size: 0.9rem; margin: 12px 0; }

.gp-consent { display: flex; gap: 10px; align-items: flex-start; background: #0f1514; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 13px 14px; margin: 16px 0; cursor: pointer; }
.gp-consent input { width: 20px; height: 20px; margin-top: 1px; accent-color: var(--gp-primary); flex-shrink: 0; }
.gp-consent-text { font-size: 0.88rem; line-height: 1.4; }
.gp-consent-opt { display: block; font-size: 0.76rem; opacity: 0.55; margin-top: 2px; }

.gp-menu-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
@media (min-width: 480px) { .gp-menu-grid { grid-template-columns: 1fr 1fr; } }
.gp-menu-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; text-align: left; background: #131a18; border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 18px 16px; cursor: pointer; color: inherit; transition: border-color 0.15s ease, transform 0.05s ease; }
.gp-menu-card:active { transform: scale(0.985); }
.gp-menu-card:hover { border-color: var(--gp-primary); }
.gp-menu-card:disabled { opacity: 0.45; cursor: not-allowed; }
.gp-menu-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); color: var(--gp-primary); }
.gp-menu-card:nth-child(2) .gp-menu-icon { color: var(--gp-accent); }
.gp-menu-title { font-size: 1.02rem; font-weight: 700; }
.gp-menu-blurb { font-size: 0.83rem; opacity: 0.65; line-height: 1.4; }

.gp-wf-header { display: flex; align-items: center; gap: 10px; padding: 4px 0 14px; }
.gp-back { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.07); border: none; color: inherit; border-radius: 10px; padding: 9px 12px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
.gp-wf-title { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.25rem; font-weight: 600; }

.gp-banner { border-radius: 12px; padding: 11px 14px; font-size: 0.85rem; line-height: 1.45; margin-bottom: 14px; }
.gp-banner-host { background: rgba(255, 138, 92, 0.12); border: 1px solid rgba(255, 138, 92, 0.35); }

.gp-chat-list { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 4px 0 14px; min-height: 200px; }
.gp-bubble { max-width: 85%; padding: 11px 14px; border-radius: 16px; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.gp-bubble-user { align-self: flex-end; background: var(--gp-primary); color: #06201c; border-bottom-right-radius: 6px; }
.gp-bubble-assistant { align-self: flex-start; background: #1a2320; border: 1px solid rgba(255,255,255,0.08); border-bottom-left-radius: 6px; }
.gp-bubble-host { align-self: flex-start; background: rgba(255, 138, 92, 0.16); border: 1px solid rgba(255, 138, 92, 0.35); border-bottom-left-radius: 6px; }
.gp-bubble-emergency { border-color: #ff6b54; background: rgba(255, 107, 84, 0.14); }
.gp-bubble-tag { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.6; margin-bottom: 4px; }
.gp-bubble-meta { display: block; font-size: 0.72rem; opacity: 0.55; margin-top: 6px; }

.gp-chips { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 12px; }
.gp-chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: inherit; border-radius: 999px; padding: 9px 14px; font-size: 0.85rem; cursor: pointer; }
.gp-chip:hover { border-color: var(--gp-primary); }

.gp-input-row { display: flex; gap: 8px; padding-top: 4px; }
.gp-input-row .gp-input { flex: 1; }
.gp-send { width: 50px; flex-shrink: 0; border: none; border-radius: 12px; background: var(--gp-primary); color: #06201c; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.gp-send:disabled { opacity: 0.5; }
.gp-send-accent { background: var(--gp-accent); color: #2a1408; }

.gp-empty { text-align: center; padding: 40px 20px; opacity: 0.75; font-size: 0.95rem; line-height: 1.5; }
.gp-confirm { text-align: center; padding: 28px 18px; }
.gp-confirm-icon { color: var(--gp-primary); margin: 0 auto 12px; }
.gp-ref { display: inline-block; background: rgba(255,255,255,0.08); border-radius: 8px; padding: 6px 12px; font-weight: 700; letter-spacing: 0.05em; margin: 10px 0; }

.gp-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.09); }
.gp-badge-waiting { background: rgba(255, 138, 92, 0.18); color: var(--gp-accent); }

.gp-offer { background: #131a18; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 15px; margin-bottom: 10px; cursor: pointer; text-align: left; width: 100%; color: inherit; }
.gp-offer:hover { border-color: var(--gp-primary); }
.gp-offer-title { font-weight: 700; font-size: 0.98rem; }
.gp-offer-price { color: var(--gp-primary); font-size: 0.85rem; font-weight: 600; margin-top: 2px; }
.gp-offer-desc { font-size: 0.84rem; opacity: 0.65; margin-top: 6px; line-height: 1.45; }
.gp-cat { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.5; margin: 18px 0 8px; }

.gp-stepper { display: flex; align-items: center; gap: 14px; }
.gp-stepper button { width: 38px; height: 38px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: #0f1514; color: inherit; font-size: 1.15rem; cursor: pointer; }
.gp-stepper span { font-size: 1.05rem; font-weight: 700; min-width: 22px; text-align: center; }
.gp-variant-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.gp-variant { border: 1px solid rgba(255,255,255,0.15); background: #0f1514; color: inherit; border-radius: 999px; padding: 9px 15px; font-size: 0.88rem; cursor: pointer; }
.gp-variant-on { border-color: var(--gp-primary); background: rgba(51, 230, 212, 0.12); }

.gp-spin { animation: gp-spin 1s linear infinite; }
  /* A11y: portaled sheet scrim + form-field readability (normal, focus, autofill). */
  .gp-sheet-scrim { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; background: rgba(4, 8, 7, 0.72); backdrop-filter: blur(3px); overflow-y: auto; }
  .gp-sheet-home { align-self: flex-start; margin: 8px; }
  .gp-sheet-scrim input:focus-visible, .gp-sheet-scrim textarea:focus-visible { outline: 2px solid var(--gp-primary); outline-offset: 2px; }
  .gp-sheet-scrim input:-webkit-autofill { -webkit-box-shadow: inset 0 0 0 1000px #171c25; -webkit-text-fill-color: #fbf7ef; caret-color: #fbf7ef; transition: background-color 9999s ease-in-out 0s; }
  .gp-lang-search:hover { border-color: var(--gp-primary); }
@keyframes gp-spin { to { transform: rotate(360deg); } }
`;
