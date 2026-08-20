'use client';

import { useState, type FormEvent } from 'react';

// Step 2 of the portal: guest registration. First/last name and phone are
// required; notification consent is optional and never blocks registration.
export function RegisterForm(props: {
  slug: string;
  propertyName: string;
  onRegistered: (guestName: string) => void;
  onSessionExpired: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false); // optional, default unchecked
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string; form?: string }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!firstName.trim()) next.firstName = 'First name is required.';
    if (!lastName.trim()) next.lastName = 'Last name is required.';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) next.phone = 'Enter a valid phone number.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch(`/api/guest/${props.slug}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          notificationConsent: consent,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      if (res.ok && json.ok) {
        props.onRegistered(typeof json.guestName === 'string' ? json.guestName : firstName.trim());
        return;
      }
      setErrors({ form: typeof json.error === 'string' ? json.error : 'Please check your details and try again.' });
    } catch {
      setErrors({ form: 'Something went wrong. Please check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guest registration">
      <h1 className="gp-step-title">Almost there</h1>
      <p className="gp-step-sub">Tell us who&apos;s staying so your host knows who they&apos;re talking to.</p>

      <form onSubmit={onSubmit} noValidate>
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-first">First name</label>
          <input
            id="gp-first"
            className="gp-input"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={busy}
            required
          />
          {errors.firstName ? <div className="gp-field-error">{errors.firstName}</div> : null}
        </div>

        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-last">Last name</label>
          <input
            id="gp-last"
            className="gp-input"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={busy}
            required
          />
          {errors.lastName ? <div className="gp-field-error">{errors.lastName}</div> : null}
        </div>

        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-phone">Phone number</label>
          <input
            id="gp-phone"
            className="gp-input"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
            required
          />
          {errors.phone ? <div className="gp-field-error">{errors.phone}</div> : null}
        </div>

        <label className="gp-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={busy}
          />
          <span className="gp-consent-text">
            I agree to receive notifications from {props.propertyName}.
            <span className="gp-consent-opt">Optional — everything works either way.</span>
          </span>
        </label>

        {errors.form ? <div className="gp-error" role="alert">{errors.form}</div> : null}

        <button type="submit" className="gp-btn gp-btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </section>
  );
}
