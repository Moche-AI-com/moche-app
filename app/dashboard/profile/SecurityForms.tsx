'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { ShieldCheck, Smartphone, CheckCircle2 } from 'lucide-react';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import {
  sendPhoneOtpAction,
  verifyPhoneOtpAction,
  setSmsOptInAction,
  toggleTwoFactorAction,
  type SecurityFormState,
} from './security-actions';

// TCPA disclosure shown at the point of consent (opt-in checkbox + toggles).
const TCPA_FINE_PRINT =
  'By enabling SMS alerts you consent to receive automated operational text messages from Moche-AI ' +
  '(e.g. guest escalations and login codes). Message frequency varies. Message & data rates may apply. ' +
  'Reply STOP to opt out at any time; reply HELP for help. Consent is not a condition of purchase.';

export function SecurityForms({
  initialPhone,
  phoneVerified,
  smsOptIn,
  twoFactorEnabled,
}: {
  initialPhone: string;
  phoneVerified: boolean;
  smsOptIn: boolean;
  twoFactorEnabled: boolean;
}) {
  const [sendState, sendAction] = useFormState<SecurityFormState, FormData>(sendPhoneOtpAction, {});
  const [verifyState, verifyAction] = useFormState<SecurityFormState, FormData>(verifyPhoneOtpAction, {});
  const [phone, setPhone] = useState(initialPhone);
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  // Advance to the code step once a code has been dispatched.
  useEffect(() => {
    if (sendState.codeSent) setStep('code');
  }, [sendState.codeSent]);
  // Reset back to the phone step after a successful verification.
  useEffect(() => {
    if (verifyState.success) setStep('phone');
  }, [verifyState.success]);

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 520 }} data-testid="security-card">
      <h3 style={{ fontSize: '1.05rem', marginBottom: '.35rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        <ShieldCheck size={18} aria-hidden /> Phone &amp; security
      </h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        Verify a mobile number to receive escalation alerts by SMS and to enable optional two-factor login.
      </p>

      {phoneVerified && (
        <div
          className="alert alert-success"
          style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '1rem' }}
          data-testid="phone-verified-badge"
        >
          <CheckCircle2 size={16} aria-hidden /> Phone verified{initialPhone ? ` (${initialPhone})` : ''}.
        </div>
      )}

      {/* --- Phone verification (add / re-verify) --- */}
      {step === 'phone' ? (
        <form action={sendAction} data-testid="phone-send-form">
          <FormMessage error={sendState.error} />
          <div className="field">
            <label className="label" htmlFor="phone">
              <Smartphone size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Mobile number
            </label>
            <input
              className="input"
              id="phone"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              placeholder="+1 555 000 0000"
              autoComplete="tel"
              required
              data-testid="input-host-phone"
            />
            <p className="faint" style={{ fontSize: '.75rem', marginTop: '.35rem' }}>
              Standard message &amp; data rates may apply. We only text you operational alerts.
            </p>
          </div>
          <SubmitButton testId="button-send-host-otp">
            {phoneVerified ? 'Send code to re-verify' : 'Send verification code'}
          </SubmitButton>
        </form>
      ) : (
        <form action={verifyAction} data-testid="phone-verify-form">
          <FormMessage error={verifyState.error} success={verifyState.success} />
          <input type="hidden" name="phone" value={phone} />
          <div className="field">
            <label className="label" htmlFor="code">6-digit code</label>
            <input
              className="input"
              id="code"
              name="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              required
              style={{ letterSpacing: '.3em', textAlign: 'center' }}
              data-testid="input-host-otp"
            />
          </div>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.82rem', margin: '.5rem 0 1rem' }}>
            <input type="checkbox" name="optIn" style={{ marginTop: 3 }} data-testid="checkbox-sms-optin" />
            <span>Yes, enable operational SMS alerts. {TCPA_FINE_PRINT}</span>
          </label>
          <SubmitButton testId="button-verify-host-otp">Verify &amp; save</SubmitButton>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '.5rem', width: '100%' }}
            onClick={() => setStep('phone')}
            data-testid="button-change-host-phone"
          >
            Use a different number
          </button>
        </form>
      )}

      {/* --- Post-verification toggles --- */}
      {phoneVerified && (
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border, rgba(0,0,0,.1))', paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          <SmsOptInToggle enabled={smsOptIn} />
          <TwoFactorToggle enabled={twoFactorEnabled} />
        </div>
      )}
    </div>
  );
}

function SmsOptInToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<SecurityFormState, FormData>(setSmsOptInAction, {});
  return (
    <form action={action} data-testid="sms-optin-form">
      <FormMessage error={state.error} success={state.success} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: '.9rem' }}>Operational SMS alerts</div>
          <p className="faint" style={{ fontSize: '.75rem', margin: '.15rem 0 0' }}>
            {enabled ? 'On — escalations may text you.' : 'Off. Msg & data rates may apply. Reply STOP to opt out.'}
          </p>
        </div>
        <input type="hidden" name="optIn" value={enabled ? 'false' : 'true'} />
        <SubmitButton className="btn btn-secondary" testId="button-toggle-sms-optin">
          {enabled ? 'Turn off' : 'Turn on'}
        </SubmitButton>
      </div>
    </form>
  );
}

function TwoFactorToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<SecurityFormState, FormData>(toggleTwoFactorAction, {});
  return (
    <form action={action} data-testid="twofactor-form">
      <FormMessage error={state.error} success={state.success} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: '.9rem' }}>Two-factor login (SMS)</div>
          <p className="faint" style={{ fontSize: '.75rem', margin: '.15rem 0 0' }}>
            {enabled
              ? 'On — we text a code when you sign in on a new device.'
              : 'Off. Add a one-time SMS code on sign-in for extra security.'}
          </p>
        </div>
        <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
        <SubmitButton className="btn btn-secondary" testId="button-toggle-twofactor">
          {enabled ? 'Turn off' : 'Turn on'}
        </SubmitButton>
      </div>
    </form>
  );
}
