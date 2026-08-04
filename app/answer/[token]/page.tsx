import { createAdminClient } from '@/lib/supabase/admin';
import { verifyEscalationLinkToken } from '@/lib/crypto';
import { AnswerLinkForm } from './AnswerLinkForm';

export const dynamic = 'force-dynamic';

// Public, session-less escalation answer page reached from the SMS/email magic link.
// Authorization is the HMAC token alone; nothing here reveals data unless the token
// verifies AND is unexpired. The token is single-purpose and scoped to one escalation.
export default async function AnswerLinkPage({ params }: { params: { token: string } }) {
  const verified = verifyEscalationLinkToken(params.token);

  let question: string | null = null;
  let answered = false;
  if (verified) {
    const admin = createAdminClient();
    const { data: esc } = await admin
      .from('escalations')
      .select('question, status')
      .eq('id', verified.escalationId)
      .maybeSingle();
    if (esc) {
      question = esc.question;
      answered = esc.status !== 'open';
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem 4rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '.35rem' }}>Answer your guest</h1>
      <p className="muted" style={{ fontSize: '.9rem', marginBottom: '1.5rem' }}>
        A secure one-time link from Moche-AI. Your reply is sent to the guest and saved to your Property Brain.
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
        <AnswerLinkForm token={params.token} question={question} />
      )}
    </main>
  );
}
