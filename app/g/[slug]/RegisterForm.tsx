'use client';

import { useState, type FormEvent } from 'react';

// Step 2 of the portal: first-time guest profile. Terms are required; SMS host
// notifications are a separate affirmative opt-in.
export function RegisterForm(props: {
  slug: string;
  propertyName: string;
  onRegistered: (guestName: string) => void;
  onSessionExpired: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [notificationConsent, setNotificationConsent] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        notificationConsent,
        termsAccepted,
      };
      let res = await fetch(`/api/guest/${props.slug}/stay-guest/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      if (res.status === 400) {
        res = await fetch(`/api/guest/${props.slug}/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not save your profile.');
        return;
      }
      props.onRegistered(`${payload.firstName} ${payload.lastName}`.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guest registration">
      <h2 className="gp-step-title">Welcome to {props.propertyName}</h2>
      <p className="gp-step-sub">Tell us who is staying so your host can recognize your guest ID and reply securely.</p>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
          <div className="gp-field">
            <label className="gp-label" htmlFor="gp-reg-first">First name</label>
            <input
              id="gp-reg-first"
              className="gp-input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              required
            />
          </div>
          <div className="gp-field">
            <label className="gp-label" htmlFor="gp-reg-last">Last name</label>
            <input
              id="gp-reg-last"
              className="gp-input"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              required
            />
          </div>
        </div>
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-reg-phone">Mobile phone number</label>
          <input
            id="gp-reg-phone"
            className="gp-input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            required
          />
        </div>
        <div className="gp-field">
          <label className="gp-consent">
            <input type="checkbox" checked={notificationConsent} onChange={(event) => setNotificationConsent(event.target.checked)} />
            <span className="gp-consent-text">
              Text me a neutral alert when my host replies.
              <span className="gp-consent-opt">Message and data rates may apply.</span>
            </span>
          </label>
        </div>
        <div className="gp-field">
          <label className="gp-consent">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
            <span className="gp-consent-text">I agree to the guest portal terms and host notification policy.</span>
          </label>
        </div>
        {error && <div className="gp-error" role="alert">{error}</div>}
        <button type="submit" className="gp-btn gp-btn-primary" disabled={busy || !termsAccepted}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </section>
  );
}
