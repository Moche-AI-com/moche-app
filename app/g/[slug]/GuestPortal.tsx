'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Moon, Sun } from 'lucide-react';
import { CodeEntry } from './CodeEntry';
import { RegisterForm } from './RegisterForm';
import { MainMenu } from './MainMenu';
import { AiChatWorkflow } from './AiChatWorkflow';
import { HostChatWorkflow } from './HostChatWorkflow';
import { MaintenanceWorkflow } from './MaintenanceWorkflow';
import { ExtrasWorkflow, type GuestExtraOffer } from './ExtrasWorkflow';
import { LanguagePicker } from '@/components/guest/LanguagePicker';
import { resolveLanguage } from '@/lib/guest/languages';
import { portalT } from '@/lib/guest/portal-strings';
import { PORTAL_CSS, usePortalTheme } from './portalStyles';

export type PortalStep = 'code' | 'register' | 'menu' | 'ask' | 'host' | 'maintenance' | 'extras';

const LANG_STORAGE_KEY = 'gp-lang';

// Enhanced guest portal shell: a step machine covering
//   code entry → "Who's joining?" → main menu → one of four workflows.
// All workflow screens share the chrome defined here (back-to-menu, brand vars).
//
// Party access (2026-08-28): the shared stay code proves party membership only.
// Every new device then identifies itself, so each member of the party gets
// their own concierge thread, host-chat thread, and extras identity. Returning
// to the portal on the SAME browser skips both steps via the session cookie.
//
// Host preview (2026-08-28): a host of this property sees the portal exactly as
// a guest would, with every workflow live but sandboxed server-side (nothing is
// saved or sent). A demo mode also walks the sign-in steps (code → register)
// with zero network calls, so the entry flow is testable too.
//
// Theme: dark luxury is the default; guests can switch to a light theme from
// the header. The choice persists on the device (localStorage) and every color
// flows through the semantic variables in portalStyles.ts, so text stays
// readable against its background in both themes.
//
// Language: the header Globe sets the guest's language. It is sent with every
// concierge + host-chat request (the AI replies in it; the host receives an
// auto-translation), persists on-device, restores from the stay record
// (stays.guest_language) on return visits — and drives the full UI translation
// of every card, dropdown, and action via the static dictionary in
// lib/guest/portal-strings.ts (no runtime translation cost).
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
  initialLanguage: string | null;
}) {
  const [step, setStep] = useState<PortalStep>(() => {
    if (!props.initialVerified) return 'code';
    if (props.hostPreview || props.initialRegistered) return 'menu';
    return 'register';
  });
  const [guestName, setGuestName] = useState<string | null>(props.guestName);
  // Sign-in demo (host preview only): walk code → register with no network calls.
  const [demoSignIn, setDemoSignIn] = useState(false);
  const { theme, toggleTheme } = usePortalTheme();
  const [language, setLanguageState] = useState<string | null>(props.initialLanguage);

  // The portal translator: every screen below renders through this. Rebuilt
  // only when the guest's language changes.
  const t = useMemo(() => portalT(language), [language]);

  // No server-known language yet: fall back to this device's stored choice,
  // then to the browser's language as a first guess (resolveLanguage maps
  // regional variants like pt-PT onto the picker's codes).
  useEffect(() => {
    if (props.initialLanguage) return;
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (stored && resolveLanguage(stored)) {
        setLanguageState(stored);
        return;
      }
      const browser = resolveLanguage(window.navigator.language);
      if (browser) setLanguageState(browser.code);
    } catch {
      // Private-browsing modes can throw; Automatic stays in effect.
    }
  }, [props.initialLanguage]);

  const setLanguage = useCallback((code: string | null) => {
    setLanguageState(code);
    try {
      if (code) window.localStorage.setItem(LANG_STORAGE_KEY, code);
      else window.localStorage.removeItem(LANG_STORAGE_KEY);
    } catch {
      // Still applies for this session even if it cannot persist.
    }
  }, []);

  const goMenu = useCallback(() => setStep('menu'), []);
  const goCode = useCallback(() => setStep('code'), []);
  const openHostChat = useCallback(() => setStep('host'), []);
  const startSignInDemo = useCallback(() => {
    setDemoSignIn(true);
    setStep('code');
  }, []);
  const exitSignInDemo = useCallback(() => {
    setDemoSignIn(false);
    setStep('menu');
  }, []);

  const brandVars = {
    '--gp-primary': props.brandPrimary ?? '#33E6D4',
    '--gp-accent': props.brandAccent ?? '#FF8A5C',
  } as CSSProperties;

  // The host's property photo leads the entry steps AND the main menu; on the
  // workflow screens it collapses to a slim banner so chat space is untouched.
  const showHero = step === 'code' || step === 'register' || step === 'menu';

  const themeLabel = t(theme === 'dark' ? 'themeToLight' : 'themeToDark');

  return (
    <div className={`gp-v2 ${theme === 'light' ? 'gp-light' : ''} ${props.fontClassName}`} style={brandVars}>
      <style>{PORTAL_CSS}</style>
      <div className="gp-wrap">
        <header className="gp-header">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" className="gp-logo" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icon.svg" alt="Moche AI" className="gp-logo" />
          )}
          <div className="gp-header-text">
            <div className="gp-property-name">{props.propertyName}</div>
            {props.location ? <div className="gp-property-loc">{props.location}</div> : null}
          </div>
          <div className="gp-header-actions">
            <LanguagePicker value={language} onChange={setLanguage} t={t} />
            <button type="button" className="gp-icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              {theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            </button>
          </div>
        </header>

        <PortalHero
          imageUrl={props.coverImageUrl}
          name={props.propertyName}
          location={props.location}
          compact={!showHero}
        />

        <main className="gp-main">
          <div key={step} className="gp-step">
            {step === 'code' && (
              <CodeEntry
                slug={props.slug}
                accessToken={props.accessToken}
                propertyName={props.propertyName}
                t={t}
                demo={demoSignIn}
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
                t={t}
                demo={demoSignIn}
                onRegistered={(name) => {
                  setGuestName(name);
                  setDemoSignIn(false);
                  setStep('menu');
                }}
                onSessionExpired={goCode}
              />
            )}

            {demoSignIn && (step === 'code' || step === 'register') && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button type="button" className="gp-msg-link" onClick={exitSignInDemo} data-testid="button-exit-signin-demo">
                  {t('demoBackToPreview')}
                </button>
              </div>
            )}

            {step === 'menu' && (
              <MainMenu
                propertyName={props.propertyName}
                guestName={guestName}
                hostPreview={props.hostPreview}
                t={t}
                onSelect={(key) => setStep(key)}
                onPreviewSignIn={startSignInDemo}
              />
            )}

            {step === 'ask' && (
              <AiChatWorkflow
                slug={props.slug}
                propertyId={props.propertyId}
                hostPreview={props.hostPreview}
                language={language}
                t={t}
                onBack={goMenu}
                onOpenHostChat={openHostChat}
                onSessionExpired={goCode}
              />
            )}

            {step === 'host' && (
              <HostChatWorkflow
                slug={props.slug}
                propertyId={props.propertyId}
                hostPreview={props.hostPreview}
                guestName={guestName}
                language={language}
                t={t}
                onBack={goMenu}
                onSessionExpired={goCode}
              />
            )}

            {step === 'maintenance' && (
              <MaintenanceWorkflow
                slug={props.slug}
                propertyId={props.propertyId}
                hostPreview={props.hostPreview}
                t={t}
                onBack={goMenu}
                onSessionExpired={goCode}
              />
            )}

            {step === 'extras' && (
              <ExtrasWorkflow
                slug={props.slug}
                propertyId={props.propertyId}
                hostPreview={props.hostPreview}
                offers={props.extrasOffers}
                guestName={guestName}
                t={t}
                onBack={goMenu}
                onSessionExpired={goCode}
              />
            )}
          </div>
        </main>

        <footer className="gp-footer">{t('poweredBy')}</footer>
      </div>
    </div>
  );
}

function heroInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || '•';
}

// The host's chosen portal image, presented as a proper cover photo: 16:9 frame,
// gradient scrim, property name overlay on the entry steps, and a slim banner on
// workflow screens. If the image is missing or fails to load (expired URL, bad
// upload), guests see a branded monogram tile instead of a broken-image icon.
function PortalHero(props: { imageUrl: string | null; name: string; location: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!props.imageUrl && !failed;

  if (props.compact) {
    if (!showImage) return null;
    return (
      <div className="gp-hero-compact">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.imageUrl!} alt="" loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }

  return (
    <div className="gp-hero">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.imageUrl!} alt="" className="gp-hero-img" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="gp-hero-fallback" aria-hidden>{heroInitials(props.name)}</div>
      )}
      <div className="gp-hero-scrim" aria-hidden />
      <div className="gp-hero-caption">
        <div className="gp-hero-name">{props.name}</div>
        {props.location ? <div className="gp-hero-loc">{props.location}</div> : null}
      </div>
    </div>
  );
}
