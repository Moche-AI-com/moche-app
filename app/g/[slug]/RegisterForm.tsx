'use client';

import { useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import type { PortalT } from '@/lib/guest/portal-strings';

// Step 2 of the portal: "Who's joining?" Every member of the party identifies
// themselves on their own device after entering the shared stay code. Names are
// OPTIONAL (issue #133 — the stay code already routed them, and every required
// field costs concierge usage); phone is OPTIONAL and only powers the SMS reply
// alert plus reconnecting the same identity on another device. Terms are
// accepted per guest; the SMS opt-in only appears once a phone number is
// entered (it is meaningless without one).
//
// Demo mode (host preview sign-in walkthrough): the form validates natively,
// then advances without a network call — no identity is registered or saved.
export function RegisterForm(props: {
  slug: string;
  propertyName: string;
  t: PortalT;
  demo?: boolean;
  onRegistered: (guestName: string) => void;
  onSessionExpired: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [notificationConsent, setNotificationConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = props;
  const hasPhone = phone.trim().length > 0;
  // portalT falls back to the key itself when a locale has no translation yet,
  // so an unlisted key degrades gracefully to the English "(optional)".
  const optionalTag = t('regNameOptional') === 'regNameOptional' ? '(optional)' : t('regNameOptional');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (props.demo) {
        props.onRegistered(`${firstName.trim()} ${lastName.trim()}`.trim() || 'Preview Guest');
        return;
      }
      const payload = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        notificationConsent: hasPhone && notificationConsent,
        termsAccepted,
      };
      const res = await fetch(`/api/guest/${props.slug}/stay-guest/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        props.onSessionExpired();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === 'string' && res.status !== 400 ? json.error : t('regError'));
        return;
      }
      props.onRegistered(`${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim() || 'Guest');
    } catch {
      setError('Could not confirm registration. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guest registration">
      <div className="gp-kicker">
        <UserRound size={13} aria-hidden /> {t('regKicker')}
      </div>
      <h2 className="gp-step-title">{t('regTitle')}</h2>
      <p className="gp-step-sub">{t('regSub')}</p>
      {props.demo && <p className="gp-step-sub">{t('demoSigninHint')}</p>}
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
          <div className="gp-field">
            <label className="gp-label" htmlFor="gp-reg-first">
              {t('regFirstName')} <span className="gp-muted">{optionalTag}</span>
            </label>
            <input
              id="gp-reg-first"
              className="gp-input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="gp-field">
            <label className="gp-label" htmlFor="gp-reg-last">
              {t('regLastName')} <span className="gp-muted">{optionalTag}</span>
            </label>
            <input
              id="gp-reg-last"
              className="gp-input"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="gp-field">
          <label className="gp-label" htmlFor="gp-reg-phone">{t('regPhone')}</label>
          <input
            id="gp-reg-phone"
            className="gp-input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            aria-describedby="gp-reg-phone-hint"
          />
          <p id="gp-reg-phone-hint" className="gp-muted" style={{ fontSize: '.8rem', marginTop: 6 }}>
            {t('regPhoneHint')}
          </p>
        </div>
        {hasPhone && (
          <div className="gp-field">
            <label className="gp-consent">
              <input type="checkbox" checked={notificationConsent} onChange={(event) => setNotificationConsent(event.target.checked)} />
              <span className="gp-consent-text">
                {t('regSms')}
                <span className="gp-consent-opt">{t('regSmsNote')}</span>
              </span>
            </label>
          </div>
        )}
        <div className="gp-field">
          <label className="gp-consent">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
            <span className="gp-consent-text">{t('regTerms')}</span>
          </label>
        </div>
        {error && <div className="gp-error" role="alert">{error}</div>}
        <button type="submit" className="gp-btn gp-btn-primary" disabled={busy || !termsAccepted}>
          {busy ? t('saving') : t('regSubmit')}
        </button>
      </form>
    </section>
  );
}
