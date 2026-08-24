'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { Moon, Sun } from 'lucide-react';
import { CodeEntry } from './CodeEntry';
import { RegisterForm } from './RegisterForm';
import { MainMenu } from './MainMenu';
import { AiChatWorkflow } from './AiChatWorkflow';
import { HostChatWorkflow } from './HostChatWorkflow';
import { MaintenanceWorkflow } from './MaintenanceWorkflow';
import { ExtrasWorkflow, type GuestExtraOffer } from './ExtrasWorkflow';
import { PORTAL_CSS, usePortalTheme } from './portalStyles';

export type PortalStep = 'code' | 'register' | 'menu' | 'ask' | 'host' | 'maintenance' | 'extras';

// Enhanced guest portal shell: a step machine covering
//   code entry → registration → main menu → one of four workflows.
// All workflow screens share the chrome defined here (back-to-menu, brand vars).
//
// Theme: dark luxury is the default; guests can switch to a light theme from
// the header. The choice persists on the device (localStorage) and every color
// flows through the semantic variables in portalStyles.ts, so text stays
// readable against its background in both themes.
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
  const { theme, toggleTheme } = usePortalTheme();

  const goMenu = useCallback(() => setStep('menu'), []);
  const goCode = useCallback(() => setStep('code'), []);
  const openHostChat = useCallback(() => setStep('host'), []);

  const brandVars = {
    '--gp-primary': props.brandPrimary ?? '#33E6D4',
    '--gp-accent': props.brandAccent ?? '#FF8A5C',
  } as CSSProperties;

  // The host's property photo leads the entry steps AND the main menu; on the
  // workflow screens it collapses to a slim banner so chat space is untouched.
  // (The condition stays inline: extracting it to a boolean would break TS
  // narrowing on coverImageUrl at the img below.)
  const showHero = step === 'code' || step === 'register' || step === 'menu';

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

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
            <button type="button" className="gp-icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              {theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            </button>
          </div>
        </header>

        {showHero && props.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.coverImageUrl} alt="" className="gp-hero" />
        ) : null}
        {!showHero && props.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.coverImageUrl} alt="" className="gp-hero-compact" />
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
