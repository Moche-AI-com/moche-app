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

      <h2>4. Which models answer you</h2>
      <p>
        We do not train any model on your data. We use established third-party models through a
        model router (OpenRouter), which selects a model appropriate to the task and can switch to a
        backup model automatically if one is unavailable &mdash; so answers stay reliable:
      </p>
      <ul>
        <li>
          <strong>Guest answers</strong> &mdash; Google Gemini&nbsp;2.5 Flash, with OpenAI
          GPT-4o-mini and Anthropic Claude Haiku&nbsp;4.5 as automatic backups.
        </li>
        <li>
          <strong>Background processing</strong> (organizing a host&rsquo;s uploaded documents,
          categorizing knowledge) &mdash; OpenAI GPT-4o-mini and Meta Llama&nbsp;3.1.
        </li>
        <li>
          <strong>Search relevance</strong> (embeddings) and intent detection &mdash; OpenAI, called
          directly.
        </li>
      </ul>
      <p>
        Model selection may change as better or more efficient models become available. The{' '}
        <a href="/legal/subprocessors">Subprocessors page</a> is the authoritative, maintained list.
      </p>

      <h2>5. Data handling &amp; safeguards</h2>
      <p>
        Before any request leaves our infrastructure for the model router, we apply the following
        controls:
      </p>
      <ul>
        <li>
          <strong>Redaction first.</strong> Personal data is programmatically stripped from the
          prompt &mdash; the model receives your question and relevant property information, not
          your identity or contact details.
        </li>
        <li>
          <strong>Fail-closed verification.</strong> After redaction we re-scan the payload. If
          personal data is still detected, the external request is <strong>refused outright</strong>{' '}
          and handled by our primary provider instead. We never send it anyway.
        </li>
        <li>
          <strong>Zero data retention.</strong> Every request instructs the router and the
          underlying model provider not to log or retain the prompt or the response.
        </li>
        <li>
          <strong>No training on your data.</strong> Any model provider that would collect or train
          on the content is refused; the request fails rather than falling through to a provider
          without that guarantee.
        </li>
      </ul>
      <p>
        See the <a href="/legal/privacy">Privacy Policy</a>,{' '}
        <a href="/legal/security">Security Overview</a>, and{' '}
        <a href="/legal/subprocessors">Subprocessors</a> for details.
      </p>

      <h2>6. Human oversight</h2>
      <p>
        Hosts review escalations and can correct or supplement the Property Brain. The AI does not
        take real-world actions (bookings, payments, dispatch) on a guest&rsquo;s behalf.
      </p>
    </article>
  );
}
