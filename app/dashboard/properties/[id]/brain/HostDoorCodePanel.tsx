'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';

const REVEAL_SECONDS = 30;

// Host-only door code card. Guests and the AI never see this value; guest
// questions about entry codes are escalated to the host instead. The plaintext
// only exists in this component while it is revealed, and it is cleared after
// REVEAL_SECONDS, when the tab is hidden, or when the card unmounts.
export function HostDoorCodePanel({ propertyId, hasCode }: { propertyId: string; hasCode: boolean }) {
  const [stored, setStored] = useState(hasCode);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpoint = `/api/host/properties/${encodeURIComponent(propertyId)}/brain/door-code`;

  function hide() {
    setRevealed(null);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function reveal() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Could not load the door code.'); return; }
      if (!body.code) { setStored(false); setNotice('No door code is saved yet.'); return; }
      setRevealed(body.code as string);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, REVEAL_SECONDS * 1000);
    } catch {
      setError('Could not load the door code. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) { setError('Enter a code.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PUT', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Could not save the door code.'); return; }
      setStored(true); setEditing(false); setDraft(''); hide();
      setNotice('Saved. Only you and your Brain editors can view it.');
    } catch {
      setError('Could not save the door code. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setNotice('Copied to your clipboard.');
    } catch {
      setError('Copy failed. Select the code to copy it.');
    }
  }

  return (
    <section className="card" style={{ padding: '1.1rem' }} data-testid="host-door-code-panel" aria-label="Door code, host only">
      <h2 style={{ fontSize: '1rem', margin: '0 0 .35rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        <KeyRound size={16} aria-hidden /> Door code <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>(host only)</span>
      </h2>
      <p className="faint" style={{ fontSize: '.82rem', margin: '0 0 .8rem', display: 'flex', gap: '.35rem', alignItems: 'flex-start' }}>
        <Lock size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
        Optional, for your own records. Stored encrypted. Guests and the concierge never see it; when a guest asks for a code, you get an escalation and reply yourself.
      </p>

      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
          <code
            data-testid="door-code-value"
            style={{ fontSize: '1.05rem', letterSpacing: revealed ? '.08em' : '.2em', padding: '.3rem .6rem', borderRadius: 6, background: 'var(--surface-2, rgba(0,0,0,.05))' }}
          >
            {revealed ?? (stored ? '\u2022\u2022\u2022\u2022\u2022\u2022' : 'Not saved')}
          </code>
          {stored && !revealed && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reveal} disabled={busy} data-testid="button-door-code-reveal">
              <Eye size={14} aria-hidden /> Reveal
            </button>
          )}
          {revealed && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copy} data-testid="button-door-code-copy">
                <Copy size={14} aria-hidden /> Copy
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={hide} data-testid="button-door-code-hide">
                <EyeOff size={14} aria-hidden /> Hide
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { hide(); setEditing(true); setError(null); setNotice(null); }} disabled={busy} data-testid="button-door-code-edit">
            {stored ? 'Replace' : 'Add code'}
          </button>
        </div>
      )}

      {editing && (
        <form onSubmit={save} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor="host-door-code-input" className="sr-only">Door code</label>
          <input
            id="host-door-code-input"
            type="password"
            inputMode="text"
            autoComplete="new-password"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            maxLength={64}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter the door or lockbox code"
            className="input"
            style={{ minWidth: 220 }}
            data-testid="input-door-code"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy} data-testid="button-door-code-save">Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(''); }} disabled={busy}>Cancel</button>
        </form>
      )}

      {revealed && <p className="faint" style={{ fontSize: '.75rem', marginTop: '.5rem' }}>Hides automatically in {REVEAL_SECONDS} seconds. Every reveal is logged.</p>}
      {error && <p role="alert" style={{ fontSize: '.82rem', marginTop: '.5rem', color: 'var(--danger, #c0392b)' }}>{error}</p>}
      {notice && <p role="status" className="faint" style={{ fontSize: '.82rem', marginTop: '.5rem' }}>{notice}</p>}
    </section>
  );
}
