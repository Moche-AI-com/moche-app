import { InviteAcceptanceClient } from './InviteAcceptanceClient';
import { InviteShell } from './InviteShell';
import { acceptInviteAction } from './actions';
import { getMemberInviteByToken } from '@/lib/auth/member-invites';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'Invitation not found',
    body: 'This invitation link is not valid. Ask the account owner to send you a new one.',
  },
  revoked: {
    title: 'Invitation revoked',
    body: 'The account owner revoked this invitation. Contact them if you still need access.',
  },
  accepted: {
    title: 'Invitation already accepted',
    body: 'This invitation has already been used. Sign in to access the account.',
  },
  expired: {
    title: 'Invitation expired',
    body: 'This invitation is more than seven days old. Ask the account owner to send a fresh one.',
  },
  unavailable: {
    title: 'Invitation temporarily unavailable',
    body: 'We could not load this invitation right now. Please try again shortly.',
  },
};

export default async function InvitePage({ params }: { params: { token: string } }) {
  const lookup = await getMemberInviteByToken(params.token);

  if (lookup.status !== 'ready') {
    const copy = UNAVAILABLE_COPY[lookup.status];
    return <InviteUnavailable title={copy.title} body={copy.body} />;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <InviteAcceptanceClient
      accountName={lookup.value.account.name}
      email={lookup.value.invite.email}
      role={lookup.value.role}
      capabilities={lookup.value.capabilities}
      properties={lookup.value.properties.map((property) => property.display_name)}
      hasAllProperties={lookup.value.invite.property_ids.length === 0}
      signedInEmail={user?.email ?? null}
      action={acceptInviteAction.bind(null, params.token)}
    />
  );
}

function InviteUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <InviteShell eyebrow="Account invitation" title={title} titleId="invite-unavailable-title">
      <p className="muted" style={{ fontSize: '.9rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
        {body}
      </p>
      <a
        href="/login"
        className="gradient-text"
        style={{ display: 'inline-block', fontWeight: 700, minHeight: 44, padding: '.7rem 0' }}
      >
        Go to sign in
      </a>
    </InviteShell>
  );
}
