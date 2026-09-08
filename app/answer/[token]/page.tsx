import { createAdminClient } from '@/lib/supabase/admin';
import { verifyEscalationLinkToken } from '@/lib/crypto';
import { AnswerLinkForm } from './AnswerLinkForm';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Public, session-less escalation answer page reached from the SMS/email magic link.
// Authorization is the HMAC token alone; nothing here reveals data unless the token
// verifies AND is unexpired. The token is single-purpose and scoped to one escalation.
export default async function AnswerLinkPage({ params }: { params: Promise<{ token: string }> }) {
  await requireSession();
  const verified = verifyEscalationLinkToken((await params).token);

  let question: string | null = null;
  let answered = false;
  if (verified) {
    const admin = createClient();
    const { data: esc } = await admin
      .from('escalations')
      .select('question, status, property_id')
      .eq('id', verified.escalationId)
      .maybeSingle();
    if (esc) {
      const access = await requirePropertyAccess(esc.property_id);
      if (access.can.receiveEscalations && access.can.replyGuests) {
        question = esc.question;
        answered = esc.status !== 'open';
      }
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem 4rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '.35rem' }}>Answer your guest</h1>
      <p className="muted" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>
        Sign in to reply to your guest. Brain updates require a separate proposal and approval.
      </p>

      {!verified || question === null ? (
        <div className="alert alert-error" data-testid="answer-link-invalid">
          This answer link is invalid or has expired. Open your dashboard to answer from there.
        </div>
      ) : answered ? (
        <div className="alert alert-success" data-testid="answer-link-answered">
          This question has already been answered. Nothing more to do here.
        </div>
      ) : (
        <AnswerLinkForm token={(await params).token} question={question} />
      )}
    </main>
  );
}
