'use client';

import { useState, type FormEvent } from 'react';

// Step 2 of the portal: first-time guest profile. Terms are required; SMS host
// notifications are a separate affirmative opt-in.
export function RegisterForm(props: {
  slug: string;
  propertyName: string;
  onRegistered: (guestName: string) => void;
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
      if (res.status === 400) {
        res = await fetch(`/api/guest/${props.slug}/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
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
      <h2>Welcome to {props.propertyName}</h2>
      <p className="muted">Tell us who is staying so your host can recognize your guest ID and reply securely.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: '.8rem', marginTop: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
          <label>
            First name
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required />
          </label>
        </div>
        <label>
          Mobile phone number
          <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
        </label>
        <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={notificationConsent} onChange={(event) => setNotificationConsent(event.target.checked)} />
          <span>Text me a neutral alert when my host replies. Message and data rates may apply.</span>
        </label>
        <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
          <span>I agree to the guest portal terms and host notification policy.</span>
        </label>
        {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}
        <button type="submit" disabled={busy || !termsAccepted}>{busy ? 'Saving…' : 'Continue'}</button>
      </form>
    </section>
  );
}
