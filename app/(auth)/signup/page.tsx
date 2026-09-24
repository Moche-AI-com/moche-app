'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import { signupAction, type FormState } from '../actions';
import { PLANS } from '@/lib/constants';
import { parsePricingIntent } from '@/lib/billing/pricing-intent';
import {
  SubmitButton,
  FormMessage,
  FieldError,
  PasswordRequirements,
  passwordMeetsRequirements,
  isValidEmail,
} from '@/components/FormFeedback';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden="true" style={{ color: 'var(--coral, #ff6b54)' }}>
      {' *'}
    </span>
  );
}

function SignupForm() {
  const [state, formAction] = useFormState<FormState, FormData>(signupAction, {});
  const params = useSearchParams();
  const prefillEmail = params.get('email') ?? '';
  const intent = parsePricingIntent(params.get('plan'), params.get('interval'));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const fullNameValid = fullName.trim().length > 0;
  const emailValid = isValidEmail(email.trim());
  const passwordValid = passwordMeetsRequirements(password);
  const phoneDigits = phone.replace(/\D/g, '').length;
  const phoneValid = !smsOptIn || phoneDigits >= 10;
  const formValid = fullNameValid && emailValid && passwordValid && acceptTerms && phoneValid;

  let emailError: string | undefined;
  if (emailTouched) {
    if (email.trim() === '') emailError = 'Email is required.';
    else if (!emailValid) emailError = 'Enter a valid email address.';
  }
  const phoneError =
    smsOptIn && phoneTouched && phoneDigits < 10
      ? 'Enter the mobile number where you want to receive text messages.'
      : undefined;

  const missing: string[] = [];
  if (!fullNameValid) missing.push('your full name');
  if (!emailValid) missing.push('a valid email address');
  if (!passwordValid) missing.push('a password that meets the requirement above');
  if (!acceptTerms) missing.push('agreement to the Terms of Service');
  if (!phoneValid) missing.push('your mobile number for SMS alerts');
  const disabledHint = formValid
    ? undefined
    : `Still needed: ${missing.slice(0, 2).join(' and ')}${missing.length > 2 ? `, plus ${missing.length - 2} more` : ''}.`;

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Create your host account</h1>
      <p className="muted" style={{ marginBottom: '.3rem', fontSize: '.9rem' }}>Start building your Property Brain.</p>
      {intent ? (
        <div className="alert alert-info" style={{ margin: '.75rem 0 1rem', fontSize: '.85rem', lineHeight: 1.5 }}>
          <strong>Your selection: {PLANS[intent.planId].name}, {intent.interval}.</strong>{' '}
          Create your free account first. You can review the current price and confirm a subscription in Billing after email verification. No payment is taken now.
        </div>
      ) : null}
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.78rem' }}>
        Fields marked<RequiredMark /> are required.
      </p>
      <form action={formAction}>
        {intent ? (
          <>
            <input type="hidden" name="plan" value={intent.planId} />
            <input type="hidden" name="interval" value={intent.interval} />
          </>
        ) : null}
        <FormMessage error={state.error} />
        <div className="field">
          <label className="label" htmlFor="fullName">Full name<RequiredMark /></label>
          <input
            className="input"
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="accountName">Account / business name <span className="faint">(optional)</span></label>
          <input className="input" id="accountName" name="accountName" type="text" />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">Email<RequiredMark /></label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-required="true"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'signup-email-error' : undefined}
            style={emailError ? { borderColor: 'var(--coral, #ff6b54)' } : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
          />
          <FieldError id="signup-email-error" message={emailError} />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password<RequiredMark /></label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            aria-required="true"
            aria-describedby="signup-password-requirements"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordRequirements id="signup-password-requirements" password={password} />
        </div>
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.82rem', marginBottom: '.6rem' }} className="muted">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            aria-required="true"
            style={{ marginTop: '.2rem' }}
            data-testid="signup-accept-terms"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
          />
          <span>
            I have read and agree to the{' '}
            <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="gradient-text">Terms of Service</Link>,{' '}
            <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="gradient-text">Privacy Policy</Link>, and{' '}
            <Link href="/legal/acceptable-use" target="_blank" rel="noopener noreferrer" className="gradient-text">Acceptable Use Policy</Link>.
            <RequiredMark />
          </span>
        </label>
        <p className="muted" style={{ fontSize: '.74rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Moche uses AI to help answer guest questions — see our{' '}
          <Link href="/legal/ai-policy" target="_blank" rel="noopener noreferrer" className="gradient-text">AI Policy</Link>. By continuing you also acknowledge our{' '}
          <Link href="/legal/cookies" target="_blank" rel="noopener noreferrer" className="gradient-text">Cookie Notice</Link>. Each opens in a new tab so you can read it in full.
        </p>
        <div
          style={{
            border: '1px solid rgba(157,176,198,0.18)',
            borderRadius: '.7rem',
            padding: '.85rem .9rem',
            marginBottom: '1rem',
            background: 'rgba(51,230,212,0.04)',
          }}
        >
          <label style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', fontSize: '.82rem' }}>
            <input
              type="checkbox"
              name="smsOptIn"
              value="on"
              style={{ marginTop: '.15rem' }}
              data-testid="signup-sms-optin"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
            />
            <span style={{ lineHeight: 1.5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 600, color: 'var(--text)' }}>
                <MessageSquare size={14} aria-hidden="true" /> Text me guest &amp; property alerts (optional)
              </span>
              <br />
              I agree to receive recurring account and guest-related SMS/WhatsApp messages from Moche-AI at the
              mobile number I enter below. Message frequency varies. Message &amp; data rates may apply.
              Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our{' '}
              <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="gradient-text">Privacy Policy</Link>{' '}and{' '}
              <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="gradient-text">Terms</Link>.
            </span>
          </label>
          <div className="field" style={{ marginTop: '.75rem', marginBottom: 0 }}>
            <label className="label" htmlFor="phone">
              Mobile phone number{' '}
              {smsOptIn ? <RequiredMark /> : <span className="faint">(required only if you check the box above)</span>}
            </label>
            <input
              className="input"
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 (555) 123-4567"
              data-testid="signup-phone"
              aria-required={smsOptIn || undefined}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? 'signup-phone-error' : undefined}
              style={phoneError ? { borderColor: 'var(--coral, #ff6b54)' } : undefined}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
            />
            <FieldError id="signup-phone-error" message={phoneError} />
          </div>
        </div>
        <SubmitButton testId="signup-submit" disabled={!formValid} disabledHint={disabledHint}>
          Create account
        </SubmitButton>
      </form>
      <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '.85rem' }}>
        <span className="muted">Already have an account? </span>
        <Link href="/login" className="gradient-text" style={{ fontWeight: 600 }}>Sign in</Link>
      </div>
    </>
  );
}
