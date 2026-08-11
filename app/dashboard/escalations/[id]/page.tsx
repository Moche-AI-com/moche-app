import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EscalationAnswerForm } from './EscalationAnswerForm';

export const dynamic = 'force-dynamic';

export default async function EscalationDetailPage({ params }: { params: { id: string } }) {
  await requireSession();
  const supabase = createClient();

  // RLS scopes escalations through properties the host can see. A miss (wrong host or
  // bad id) sends them back to the list rather than leaking existence.
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, question, status, host_response, conversation_id, created_at, responded_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!esc) redirect('/dashboard/escalations');

  // Confirm the host can act on this property (redirects otherwise).
  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) redirect('/dashboard/escalations');

  // Conversation context. messages have no host-side SELECT RLS policy (they are a
  // server-controlled artifact), so read via the service-role client after the access
  // check above, scoped to this conversation + property.
  let history: { role: string; content: string; created_at: string }[] = [];
  if (esc.conversation_id) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', esc.conversation_id)
      .eq('property_id', esc.property_id)
      .order('created_at', { ascending: true })
      .limit(50);
    history = data ?? [];
  }

  const answered = esc.status !== 'open';

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard/escalations" className="faint" style={{ fontSize: '.82rem' }}>
          &larr; Back to escalations
        </Link>
      </div>

      <h1 style={{ fontSize: '1.6rem', marginBottom: '.5rem' }}>Answer the guest</h1>
      <span className="badge badge-property" style={{ marginBottom: '1.25rem', display: 'inline-flex' }}>
        <Building2 size={12} aria-hidden />
        <span>{access.property.display_name}</span>
      </span>

      <div className="card" style={{ padding: '1.15rem 1.25rem', marginBottom: '1.25rem' }}>
        <span className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Guest question
        </span>
        <p style={{ margin: '.4rem 0 0', fontWeight: 500, fontSize: '1.05rem' }}>{esc.question}</p>
      </div>

      {history.length > 0 && (
        <div className="card" style={{ padding: '1.15rem 1.25rem', marginBottom: '1.25rem' }}>
          <span className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Conversation
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginTop: '.6rem' }}>
            {history.map((m, i) => (
              <div key={i} style={{ fontSize: '.88rem' }}>
                <span className="faint" style={{ fontSize: '.72rem', display: 'block', marginBottom: '.1rem' }}>
                  {m.role === 'guest' ? 'Guest' : m.role === 'assistant' ? 'Concierge' : m.role === 'host' ? 'You (host)' : m.role}
                </span>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '1.15rem 1.25rem' }}>
        {answered && esc.host_response ? (
          <div>
            <span className="badge badge-teal" style={{ marginBottom: '.6rem', display: 'inline-block' }}>
              {esc.status}
            </span>
            <p className="faint" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 .3rem' }}>
              Your answer
            </p>
            <p style={{ margin: 0 }}>{esc.host_response}</p>
          </div>
        ) : (
          access.can.replyGuests ? <EscalationAnswerForm escalationId={esc.id} defaultValue={esc.host_response ?? ''} canTeachBrain={access.can.editBrain} /> : <p className="muted" style={{ margin: 0 }}>You can view this escalation but do not have permission to reply to guests.</p>
        )}
      </div>
    </div>
  );
}
