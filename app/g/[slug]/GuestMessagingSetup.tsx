'use client';

import { useState, type FormEvent } from 'react';

export function GuestMessagingSetup({ slug, onReady }: { slug: string; onReady: () => void }) {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(`/api/guest/${slug}/notify-consent`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requested ? { action: 'confirm', phone, code } : { action: 'start', phone, consent, termsAccepted: terms }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.sms === 'unknown') setRequested(true);
        setNotice(json.error || 'Could not confirm phone setup.');
        return;
      }
      if (requested && json.canSend === true) { onReady(); return; }
      setRequested(true);
      setNotice(json.message || 'Phone verified. Refreshing your messaging access.');
      if (requested) onReady();
    } catch { setNotice('Could not confirm this request. If a code arrives, enter it; wait before requesting another.'); setRequested(true); }
    finally { setBusy(false); }
  }
  return (
    <form className="gp-card" onSubmit={submit} style={{ marginBottom: '1rem' }}>
      <strong>Connect your phone to message your host</strong>
      <p className="gp-muted">Any browser works. Verify your own phone and opt into SMS reply alerts. The AI concierge does not require a phone.</p>
      <label className="gp-label" htmlFor="guest-sms-phone">Your phone, including + and country code</label>
      <input id="guest-sms-phone" className="gp-input" type="tel" autoComplete="tel" required value={phone}
        disabled={requested} onChange={(e) => setPhone(e.target.value)} placeholder="+1 …" />
      {!requested ? <>
        <label className="gp-consent"><input type="checkbox" checked={terms} required onChange={(e) => setTerms(e.target.checked)} />
          <span>I accept the <a href="/terms" target="_blank" rel="noopener noreferrer">terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a>.</span></label>
        <label className="gp-consent"><input type="checkbox" checked={consent} required onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to SMS verification and host-message alerts from Moche-AI at my number. Message frequency varies; message and data rates may apply. Reply STOP to opt out. SMS is not required to use the AI concierge.</span></label>
      </> : <>
        <label className="gp-label" htmlFor="guest-sms-code">Six-digit verification code</label>
        <input id="guest-sms-code" className="gp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" className="gp-msg-link" disabled={busy} onClick={() => { setRequested(false); setCode(''); }}>Change phone or request another code</button>
      </>}
      {notice && <p role="status">{notice}</p>}
      <button className="gp-btn gp-btn-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : requested ? 'Verify phone' : 'Request verification SMS'}</button>
    </form>
  );
}
