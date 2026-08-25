import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConversationThread } from './ConversationThread';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Full-page host ↔ guest conversation (Stays redesign). The thread owns the
// page — the old inline popout is gone — and the host steps back to the stay to
// pick a different thread. Deep-linkable, so notifications can land here.
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; stayId: string; conversationId: string }>;
  searchParams: { escalation?: string };
}) {
  const { id, stayId, conversationId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    redirect(`/dashboard/properties/${id}/stays`);
  }

  const admin = createAdminClient();
  const db = admin as any;

  const { data: conversation } = await db
    .from('conversations')
    .select('id, stay_id, channel, guest_identity_id, guest_session_id')
    .eq('id', conversationId)
    .eq('property_id', id)
    .in('channel', ['host_chat', 'announcement'])
    .maybeSingle();
  if (!conversation || conversation.stay_id !== stayId) notFound();

  const { data: stay } = await db
    .from('stays')
    .select('id, guest_display_name, status, check_in, check_out')
    .eq('id', stayId)
    .eq('property_id', id)
    .maybeSingle();
  if (!stay) notFound();

  // Prefer the identified guest's name over the booking's display name.
  let guestName = (stay.guest_display_name as string) || 'Guest';
  if (conversation.guest_identity_id) {
    const { data: identity } = await db
      .from('guest_identities')
      .select('first_name, last_name, display_name')
      .eq('id', conversation.guest_identity_id)
      .maybeSingle();
    const full = [identity?.first_name, identity?.last_name].filter(Boolean).join(' ').trim();
    if (full || identity?.display_name) guestName = full || identity.display_name;
  }

  const { count: openEscalationCount } = await db
    .from('escalations')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', id)
    .or(`conversation_id.eq.${conversationId},host_conversation_id.eq.${conversationId}`)
    .in('status', ['open', 'answered']);

  const canLearn = access.isOwner || (access.member as any)?.can_publish_guest_answers === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
      <div>
        <Link
          href={`/dashboard/properties/${id}/stays?stay=${stayId}`}
          className="muted"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: '2.75rem', fontSize: '.88rem' }}
          data-testid="back-to-stay"
        >
          ← Back to stay
        </Link>
      </div>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Chat with {guestName}</h1>
        <p className="faint" style={{ fontSize: '.84rem', margin: '.3rem 0 0' }}>
          {stay.status} · {fmtDate(stay.check_in)} → {fmtDate(stay.check_out)}
          {(openEscalationCount ?? 0) > 0
            ? ` · ${openEscalationCount} unresolved escalation${openEscalationCount === 1 ? '' : 's'}`
            : ''}
        </p>
      </div>
      <ConversationThread propertyId={id} conversationId={conversationId} canLearn={canLearn} initialEscalationId={searchParams.escalation ?? null} />
    </div>
  );
}
