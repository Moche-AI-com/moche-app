'use client';

import { useFormState } from 'react-dom';
import { resetUpdateAction, type FormState } from '../../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export default function ResetUpdatePage() {
  const [state, formAction] = useFormState<FormState, FormData>(resetUpdateAction, {});
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Choose a new password</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>Enter a new password for your account.</p>
      <form action={formAction}>
        <FormMessage error={state.error} />
        <div className="field">
          <label className="label" htmlFor="password">New password <span className="faint">(min 10 characters)</span></label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </div>
        <SubmitButton>Update password</SubmitButton>
      </form>
    </>
  );
}
