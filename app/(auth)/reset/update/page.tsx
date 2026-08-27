'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { resetUpdateAction, type FormState } from '../../actions';
import { SubmitButton, FormMessage, PasswordRequirements, passwordMeetsRequirements } from '@/components/FormFeedback';

export default function ResetUpdatePage() {
  const [state, formAction] = useFormState<FormState, FormData>(resetUpdateAction, {});
  const [password, setPassword] = useState('');
  const passwordValid = passwordMeetsRequirements(password);
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Choose a new password</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>Enter a new password for your account.</p>
      <form action={formAction}>
        <FormMessage error={state.error} />
        <div className="field">
          <label className="label" htmlFor="password">
            New password{' '}
            <span aria-hidden="true" style={{ color: 'var(--coral, #ff6b54)' }}>*</span>
          </label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            aria-required="true"
            aria-describedby="reset-password-requirements"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordRequirements id="reset-password-requirements" password={password} />
        </div>
        <SubmitButton
          testId="reset-update-submit"
          disabled={!passwordValid}
          disabledHint="Your password must meet the requirement above before you can update it."
        >
          Update password
        </SubmitButton>
      </form>
    </>
  );
}
