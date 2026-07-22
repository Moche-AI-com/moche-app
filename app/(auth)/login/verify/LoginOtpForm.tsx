'use client';

import { useFormState } from 'react-dom';
import { verifyLoginOtpAction, resendLoginOtpAction, type FormState } from '../../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export function LoginOtpForm({ next }: { next: string }) {
  const [state, formAction] = useFormState<FormState, FormData>(verifyLoginOtpAction, {});
  const [resendState, resendAction] = useFormState<FormState, FormData>(resendLoginOtpAction, {});
  return (
    <div data-testid="login-2fa">
      <form action={formAction}>
        <FormMessage error={state.error} />
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label className="label" htmlFor="code">6-digit code</label>
          <input
            className="input"
            id="code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            required
            style={{ letterSpacing: '.3em', textAlign: 'center' }}
            data-testid="input-login-otp"
          />
        </div>
        <SubmitButton testId="button-verify-login-otp">Verify &amp; sign in</SubmitButton>
      </form>
      <form action={resendAction} style={{ marginTop: '.75rem' }}>
        <FormMessage success={resendState.success} error={resendState.error} />
        <SubmitButton className="btn btn-ghost btn-block" testId="button-resend-login-otp">
          Resend code
        </SubmitButton>
      </form>
    </div>
  );
}
