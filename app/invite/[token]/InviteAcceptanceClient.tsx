'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { FormMessage, SubmitButton } from '@/components/FormFeedback';
import { CAPABILITIES, MEMBER_ROLES, type CapabilitySet, type InvitableRole } from '@/lib/auth/member-capabilities';
import type { InviteAcceptanceState } from './actions';
import { InviteShell } from './InviteShell';

interface InviteAcceptanceClientProps {
  accountName: string;
  email: string;
  role: InvitableRole;
  capabilities: CapabilitySet;
  properties: string[];
  hasAllProperties: boolean;
  signedInEmail: string | null;
  action: (previous: InviteAcceptanceState, formData: FormData) => Promise<InviteAcceptanceState>;
}

const INITIAL_STATE: InviteAcceptanceState = {};

function roleLabel(role: InvitableRole): string {
  return MEMBER_ROLES.find((candidate) => candidate.id === role)?.label ?? role;
}

export function InviteAcceptanceClient({
  accountName,
  email,
  role,
  capabilities,
  properties,
  hasAllProperties,
  signedInEmail,
  action,
}: InviteAcceptanceClientProps) {
  const [state, formAction] = useFormState<InviteAcceptanceState, FormData>(action, INITIAL_STATE);
  const signedInToInvitedEmail = signedInEmail?.trim().toLowerCase() === email.toLowerCase();
  const enabledActions = CAPABILITIES.filter((capability) => capabilities[capability.key]);

  return (
    <InviteShell eyebrow="You’re invited" title={`Join ${accountName}`} titleId="invite-title">
      <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
        You’ve been invited as a <strong style={{ color: 'var(--text)' }}>{roleLabel(role)}</strong>. Check the access
        below, then accept to join this Moche.AI account.
      </p>

      {/*
        Two columns on a comfortable viewport, one below 30rem. A container query
        rather than a media query would be nicer, but this card is the only thing
        on the page and its width tracks the viewport, so the breakpoint is honest.
      */}
      <section
        aria-label="Invitation access"
        className="card-2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          gap: '1rem',
          padding: '1rem',
          margin: '0 0 1.5rem',
        }}
      >
        <AccessColumn label="Actions">
          {enabledActions.length > 0 ? (
            <ul style={LIST_STYLE}>
              {enabledActions.map((capability) => (
                <li key={capability.key}>{capability.label}</li>
              ))}
            </ul>
          ) : (
            <p style={NOTE_STYLE}>No actions are enabled yet.</p>
          )}
        </AccessColumn>
        <AccessColumn label="Properties">
          {hasAllProperties ? (
            <p style={NOTE_STYLE}>All current properties in this account</p>
          ) : properties.length > 0 ? (
            <ul style={LIST_STYLE}>
              {properties.map((property) => (
                <li key={property}>{property}</li>
              ))}
            </ul>
          ) : (
            <p style={NOTE_STYLE}>No active properties are available yet.</p>
          )}
        </AccessColumn>
      </section>

      {signedInEmail && !signedInToInvitedEmail ? (
        <div className="alert alert-error" role="alert" style={{ fontSize: '.85rem' }}>
          You’re signed in as {signedInEmail}, but this invitation was sent to {email}. Sign out, then sign in with the
          invited address to continue.
        </div>
      ) : (
        <form action={formAction}>
          <FormMessage error={state.error} success={state.success} />
          <p className="muted" style={{ fontSize: '.86rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
            Invitation sent to{' '}
            <strong style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>{email}</strong>
          </p>

          {!signedInToInvitedEmail && (
            <div className="field">
              <label className="label" htmlFor="invite-password">
                Create a password <span className="faint">(min 10 characters)</span>
              </label>
              <input
                className="input"
                id="invite-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </div>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '.6rem',
              fontSize: '.82rem',
              lineHeight: 1.5,
              margin: '0 0 1rem',
              color: 'var(--text-muted)',
            }}
          >
            <input type="checkbox" name="acceptTerms" required style={{ marginTop: '.2rem', flexShrink: 0 }} />
            <span>
              I have read and agree to the{' '}
              <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="gradient-text">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="gradient-text">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <SubmitButton className="btn btn-primary btn-block">Accept invitation</SubmitButton>
        </form>
      )}

      <p className="faint" style={{ fontSize: '.78rem', lineHeight: 1.55, margin: '1.25rem 0 0' }}>
        {signedInToInvitedEmail
          ? 'Accepting adds this account to your existing Moche.AI sign-in.'
          : 'Already have an account? Sign in with the invited email, then open your invitation link again.'}
      </p>
      {!signedInToInvitedEmail && (
        <Link
          href="/login"
          className="gradient-text"
          // 44px minimum target: this is the only escape hatch on the page and it
          // is frequently tapped on a phone.
          style={{ display: 'inline-block', fontWeight: 700, minHeight: 44, padding: '.7rem 0' }}
        >
          Sign in instead
        </Link>
      )}
    </InviteShell>
  );
}

const LIST_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '.85rem',
  lineHeight: 1.55,
  margin: '.45rem 0 0',
  paddingLeft: '1.1rem',
};

const NOTE_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '.85rem',
  lineHeight: 1.55,
  margin: '.45rem 0 0',
};

function AccessColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block',
          color: 'var(--text)',
          fontSize: '.72rem',
          fontWeight: 700,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
