'use client';

import { useEffect, useState } from 'react';
import { readPartyTokenFromHash } from '@/lib/guest/party-invite-url';
import { partyT } from '@/lib/guest/party-strings';

type State = 'loading' | 'ready' | 'joining' | 'invalid' | 'error';

// Reads the invite token from the URL fragment, strips it from the address bar,
// and redeems only when the person taps Join. Link-preview crawlers do not run
// this and never see the token, so a preview can never use up an invite spot.
// Language: the portal language saved on this device, else the browser's.
export function JoinWithInvite({ slug }: { slug: string }) {
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
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '3rem 1.25rem', textAlign: 'center' }} data-testid="party-join">
      <h1 className="gp-wf-title">{t('joinTitle')}</h1>
      {state === 'loading' && <p className="gp-muted">{t('loading')}</p>}
      {(state === 'ready' || state === 'joining') && (
        <>
          <p className="gp-muted">{t('joinSub')}</p>
          <button type="button" className="btn btn-primary" onClick={join} disabled={state === 'joining'} data-testid="button-party-join">
            {state === 'joining' ? t('joining') : t('joinCta')}
          </button>
        </>
      )}
      {state === 'invalid' && (
        <p className="gp-muted" data-testid="party-join-invalid">{t('joinInvalid')}</p>
      )}
      {state === 'error' && (
        <>
          <p className="gp-muted">{t('joinError')}</p>
          <button type="button" className="btn btn-primary" onClick={() => setState('ready')}>{t('tryAgain')}</button>
        </>
      )}
    </main>
  );
}
