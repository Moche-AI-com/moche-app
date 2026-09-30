'use client';

import { useEffect, useState } from 'react';
import { readPartyTokenFromHash } from '@/lib/guest/party-invite-url';

type State = 'loading' | 'ready' | 'joining' | 'invalid' | 'error';

// Reads the invite token from the URL fragment, strips it from the address bar,
// and redeems only when the person taps Join. Link-preview crawlers do not run
// this and never see the token, so a preview can never use up an invite spot.
export function JoinWithInvite({ slug }: { slug: string }) {
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = readPartyTokenFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    setToken(t);
    setState(t ? 'ready' : 'invalid');
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
      <h1 className="gp-wf-title">You’re invited to join the stay</h1>
      {state === 'loading' && <p className="gp-muted">Loading…</p>}
      {(state === 'ready' || state === 'joining') && (
        <>
          <p className="gp-muted">Get the house guide, check-in details, local tips and a direct line to your host. You’ll add your name next.</p>
          <button type="button" className="btn btn-primary" onClick={join} disabled={state === 'joining'} data-testid="button-party-join">
            {state === 'joining' ? 'Joining…' : 'Join the stay'}
          </button>
        </>
      )}
      {state === 'invalid' && (
        <p className="gp-muted" data-testid="party-join-invalid">This invite link is invalid, full, or has expired. Ask the person who sent it for a fresh link, or contact your host.</p>
      )}
      {state === 'error' && (
        <>
          <p className="gp-muted">Something went wrong. Please try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => setState('ready')}>Try again</button>
        </>
      )}
    </main>
  );
}
