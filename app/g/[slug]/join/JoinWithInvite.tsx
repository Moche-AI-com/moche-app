'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { readPartyTokenFromHash } from '@/lib/guest/party-invite-url';
import { partyT } from '@/lib/guest/party-strings';
import { portalT } from '@/lib/guest/portal-strings';
import { PORTAL_CSS, usePortalTheme } from '../portalStyles';

type State = 'loading' | 'ready' | 'joining' | 'invalid' | 'error';

// The join page has no session yet, so it cannot know the property's brand
// colors; it uses the Moche defaults (same as properties.brand_primary/accent).
const BRAND_VARS = { '--gp-primary': '#33E6D4', '--gp-accent': '#FF8A5C' } as CSSProperties;

// Reads the invite token from the URL fragment, strips it from the address bar,
// and redeems only when the person taps Join. Link-preview crawlers do not run
// this and never see the token, so a preview can never use up an invite spot.
// Rendered inside the guest-portal shell (gp-v2 + PORTAL_CSS) so it matches the
// portal in both themes. Language: the portal language saved on this device,
// else the browser's.
export function JoinWithInvite({ slug }: { slug: string }) {
  const { theme } = usePortalTheme();
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const t = partyT(language);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem('gp-lang'); } catch { /* storage can be disabled */ }
    setLanguage(saved && saved !== 'auto' ? saved : (navigator.language || null));
    const found = readPartyTokenFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    setToken(found);
    setState(found ? 'ready' : 'invalid');
  }, []);

  async function join() {
    if (!token || state === 'joining') return;
    setState('joining');
    try {
      const res = await fetch(`/api/guest/${encodeURIComponent(slug)}/auth/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        window.location.replace(`/g/${encodeURIComponent(slug)}`);
        return;
      }
      setState(res.status >= 500 || res.status === 429 ? 'error' : 'invalid');
    } catch {
      setState('error');
    }
  }

  return (
    <div className={`gp-v2 ${theme === 'light' ? 'gp-light' : ''}`} style={BRAND_VARS}>
      <style>{PORTAL_CSS}</style>
      <div className="gp-wrap">
        <main className="gp-main gp-step" style={{ justifyContent: 'center' }} data-testid="party-join">
          <section className="gp-card" style={{ textAlign: 'center', padding: '28px 20px' }}>
            <div className="gp-card-art" style={{ height: 72, marginBottom: 16 }}>
              <Users size={30} aria-hidden />
            </div>
            <h1 className="gp-step-title" style={{ marginTop: 0 }}>{t('joinTitle')}</h1>
            {state === 'loading' && <p className="gp-step-sub">{t('loading')}</p>}
            {(state === 'ready' || state === 'joining') && (
              <>
                <p className="gp-step-sub">{t('joinSub')}</p>
                <button type="button" className="gp-btn gp-btn-primary" onClick={join} disabled={state === 'joining'} data-testid="button-party-join">
                  {state === 'joining' ? t('joining') : t('joinCta')}
                </button>
              </>
            )}
            {state === 'invalid' && (
              <div className="gp-error" data-testid="party-join-invalid">{t('joinInvalid')}</div>
            )}
            {state === 'error' && (
              <>
                <div className="gp-error" role="alert">{t('joinError')}</div>
                <button type="button" className="gp-btn gp-btn-ghost" onClick={() => setState('ready')}>{t('tryAgain')}</button>
              </>
            )}
          </section>
        </main>
        <footer className="gp-footer">{portalT(language)('poweredBy')}</footer>
      </div>
    </div>
  );
}
