'use client';

import { useFormState } from 'react-dom';
import { updateProfileAction, requestAccountDeletionAction, type ProfileFormState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export function ProfileForm({ email, fullName, phone }: { email: string; fullName: string; phone: string }) {
  const [state, formAction] = useFormState<ProfileFormState, FormData>(updateProfileAction, {});
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', maxWidth: 520 }}>
      <FormMessage error={state.error} success={state.success} />
      <div className="field">
        <label className="label">Email</label>
        <input className="input" value={email} disabled />
        <p className="faint" style={{ fontSize: '.75rem', marginTop: '.35rem' }}>Contact support to change your login email.</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="fullName">Full name</label>
        <input className="input" id="fullName" name="fullName" defaultValue={fullName} maxLength={120} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="phone">Phone (optional)</label>
        <input className="input" id="phone" name="phone" defaultValue={phone} maxLength={40} placeholder="+1 555 000 0000" />
      </div>
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction] = useFormState<ProfileFormState, FormData>(requestAccountDeletionAction, {});
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', maxWidth: 520, borderColor: 'var(--coral)' }}>
      <h3 style={{ fontSize: '1.05rem', marginBottom: '.5rem', color: 'var(--coral)' }}>Delete account</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        This schedules your account and all properties for deletion. Guest portals stop working immediately. This cannot be undone.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <div className="field">
        <label className="label" htmlFor="confirm">Type <strong>delete</strong> to confirm</label>
        <input className="input" id="confirm" name="confirm" autoComplete="off" placeholder="delete" required />
      </div>
      <SubmitButton className="btn btn-danger btn-block">Permanently delete my account</SubmitButton>
    </form>
  );
}
