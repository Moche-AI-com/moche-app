'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { resetRequestAction, type FormState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export default function ResetPage() {
  const [state, formAction] = useFormState<FormState, FormData>(resetRequestAction, {});
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Reset password</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>We&apos;ll email you a secure reset link.</p>
      <form action={formAction}>
        <FormMessage error={state.error} success={state.success} />
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <SubmitButton>Send reset link</SubmitButton>
      </form>
      <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '.85rem' }}>
        <Link href="/login" className="muted">Back to sign in</Link>
      </div>
    </>
  );
}
