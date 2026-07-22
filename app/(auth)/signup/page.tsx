'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFormState } from 'react-dom';
import { signupAction, type FormState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, formAction] = useFormState<FormState, FormData>(signupAction, {});
  const prefillEmail = useSearchParams().get('email') ?? '';
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Create your host account</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>Start building your Property Brain.</p>
      <form action={formAction}>
        <FormMessage error={state.error} />
        <div className="field">
          <label className="label" htmlFor="fullName">Full name</label>
          <input className="input" id="fullName" name="fullName" type="text" autoComplete="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="accountName">Account / business name <span className="faint">(optional)</span></label>
          <input className="input" id="accountName" name="accountName" type="text" />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={prefillEmail} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password <span className="faint">(min 10 characters)</span></label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </div>
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.82rem', marginBottom: '.6rem' }} className="muted">
          <input type="checkbox" name="acceptTerms" required style={{ marginTop: '.2rem' }} data-testid="signup-accept-terms" />
          <span>
            I have read and agree to the{' '}
            <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="gradient-text">Terms of Service</Link>,{' '}
            <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="gradient-text">Privacy Policy</Link>, and{' '}
            <Link href="/legal/acceptable-use" target="_blank" rel="noopener noreferrer" className="gradient-text">Acceptable Use Policy</Link>.
          </span>
        </label>
        <p className="muted" style={{ fontSize: '.74rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Moche uses AI to help answer guest questions — see our{' '}
          <Link href="/legal/ai-policy" target="_blank" rel="noopener noreferrer" className="gradient-text">AI Policy</Link>. By continuing you also acknowledge our{' '}
          <Link href="/legal/cookies" target="_blank" rel="noopener noreferrer" className="gradient-text">Cookie Notice</Link>. Each opens in a new tab so you can read it in full.
        </p>
        <SubmitButton>Create account</SubmitButton>
      </form>
      <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '.85rem' }}>
        <span className="muted">Already have an account? </span>
        <Link href="/login" className="gradient-text" style={{ fontWeight: 600 }}>Sign in</Link>
      </div>
    </>
  );
}
