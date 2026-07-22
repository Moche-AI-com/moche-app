import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { AttorneyReview } from '@/components/legal/AttorneyReview';

export default function AiPolicyPage() {
  return (
    <article>
      <LegalDocHeader slug="ai-policy" />

      <p>
        This policy explains how the Moche.AI guest concierge works, what it can and cannot do, and
        how it behaves when it is unsure. It is written for guests as well as hosts, consistent with
        EU AI Act Art.&nbsp;50 transparency expectations.
      </p>

      <h2>1. You are talking to an AI</h2>
      <AttorneyReview topic="AI transparency &amp; no-advice disclaimer">
        <p>
          The concierge is an <strong>artificial-intelligence assistant</strong>, not a human. It
          answers questions about the property using information the host has provided. Its answers
          may be imperfect and are <strong>not</strong> professional medical, legal, financial, or
          safety advice.
        </p>
        <p>
          <strong>In an emergency, contact local emergency services (911 in the US, 112 in the
          EU/UK) or the host directly</strong> — do not wait for the assistant.
        </p>
      </AttorneyReview>

      <h2>2. Grounded answers</h2>
      <p>
        The concierge answers from the host&rsquo;s Property Brain — their documents, FAQs, and
        recommendations. For high-stakes questions it favors host-provided, source-backed
        information and confidence thresholds rather than guessing.
      </p>

      <h2>3. Refusal &amp; escalation</h2>
      <p>
        When the concierge lacks a confident, grounded answer, it declines to speculate and{' '}
        <strong>escalates to the host</strong> instead. Questions the system detects as an emergency
        trigger a prominent instruction to contact emergency services and the host. This mirrors the
        behavior implemented in our concierge engine.
      </p>

      <h2>4. Data handling</h2>
      <p>
        Guest questions and relevant property context are processed by our AI provider to generate
        answers; personal data is redacted before any content is sent to an external model router.
        See the <a href="/legal/privacy">Privacy Policy</a> and{' '}
        <a href="/legal/security">Security Overview</a>.
      </p>

      <h2>5. Human oversight</h2>
      <p>
        Hosts review escalations and can correct or supplement the Property Brain. The AI does not
        take real-world actions (bookings, payments, dispatch) on a guest&rsquo;s behalf.
      </p>
    </article>
  );
}
