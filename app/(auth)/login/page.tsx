'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { loginAction, type FormState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

function LoginForm() {
  const [state, formAction] = useFormState<FormState, FormData>(loginAction, {});
  const next = useSearchParams().get('next') ?? '/dashboard';
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Welcome back</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>Sign in to your host dashboard.</p>
      <form action={formAction}>
        <FormMessage error={state.error} />
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton>Sign in</SubmitButton>
      </form>
      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
        <Link href="/reset" className="muted">Forgot password?</Link>
        <Link href="/signup" className="gradient-text" style={{ fontWeight: 600 }}>Create account</Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
