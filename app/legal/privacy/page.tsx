import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { AttorneyReview } from '@/components/legal/AttorneyReview';

export default function PrivacyPage() {
  return (
    <article>
      <LegalDocHeader slug="privacy" />

      <p>
        This Privacy Policy explains how Moche.AI collects, uses, discloses, and protects personal
        data. It applies to hosts (our customers) and to guests who interact with a host&rsquo;s AI
        concierge. It is written to align with the EU/UK GDPR and the California Consumer Privacy
        Act as amended by the CPRA (&ldquo;CCPA/CPRA&rdquo;).
      </p>

      <h2>1. Our roles</h2>
      <p>
        We act as a <strong>controller</strong> for host account, billing, and marketing data, and
        as a <strong>processor</strong> for the property content and guest data we handle on a
        host&rsquo;s behalf. Host processing terms are in our{' '}
        <a href="/legal/dpa">Data Processing Addendum</a>.
      </p>

      <h2>2. Data we process</h2>
      <table>
        <thead>
          <tr><th>Category</th><th>Examples</th><th>Source</th></tr>
        </thead>
        <tbody>
          <tr><td>Host account</td><td>Name, email, phone, business name</td><td>You</td></tr>
          <tr><td>Billing metadata</td><td>Plan, status, period — <em>not</em> card numbers</td><td>Stripe</td></tr>
          <tr><td>Property content</td><td>Documents, FAQs, recommendations you upload</td><td>You</td></tr>
          <tr><td>Guest interactions</td><td>Questions asked, AI answers, escalations</td><td>Guests</td></tr>
          <tr><td>Guest verification</td><td>Phone/booking identifiers stored as irreversible hashes</td><td>Guests</td></tr>
          <tr><td>Technical</td><td>IP, device/user-agent, product analytics events</td><td>Automatic</td></tr>
        </tbody>
      </table>

      <h2>3. Legal bases (GDPR)</h2>
      <AttorneyReview topic="Legal bases">
        <ul>
          <li><strong>Contract</strong> — to provide the Service you sign up for.</li>
          <li><strong>Legitimate interests</strong> — security, fraud prevention, product analytics, and service improvement, balanced against your rights.</li>
          <li><strong>Consent</strong> — for non-essential cookies/marketing where required; withdrawable at any time.</li>
          <li><strong>Legal obligation</strong> — tax, accounting, and compliance record-keeping.</li>
        </ul>
      </AttorneyReview>

      <h2>4. AI processing &amp; third parties</h2>
      <p>
        Guest questions and relevant property content are processed by our AI provider,
        <strong> OpenAI</strong>, to generate answers and embeddings. We may, on a
        <strong> conditional/optional</strong> basis, route certain requests through
        <strong> OpenRouter</strong>; this path is <strong>not active by default</strong>.
      </p>
      <p>
        <strong>Personal data is redacted from content before it is sent to any external model
        router</strong> (see our <a href="/legal/security">Security Overview</a>), and where an
        external router is used we seek <strong>Zero-Data-Retention</strong> terms. A full list of
        processors is on the <a href="/legal/subprocessors">Subprocessors</a> page.
      </p>

      <h2>5. International transfers</h2>
      <AttorneyReview topic="International transfer mechanism">
        <p>
          Where personal data is transferred outside the EEA/UK, we rely on the European
          Commission&rsquo;s <strong>Standard Contractual Clauses (SCCs)</strong> and, for UK data,
          the <strong>UK International Data Transfer Addendum / IDTA</strong>, together with
          supplementary measures as appropriate.
        </p>
      </AttorneyReview>

      <h2>6. Sale / sharing of personal information</h2>
      <AttorneyReview topic="Sale/sharing disclosure">
        <p>
          <strong>We do not sell your personal information</strong>, and we do not
          &ldquo;share&rdquo; it for cross-context behavioral advertising as those terms are defined
          under the CCPA/CPRA.
        </p>
      </AttorneyReview>

      <h2>7. Your rights</h2>
      <p>
        Subject to applicable law you may access, correct, delete, port, or object to/restrict
        processing of your personal data, and (CCPA/CPRA) opt out of sale/sharing and limit use of
        sensitive personal information. Hosts can{' '}
        <strong>export or delete their data in-app</strong> from{' '}
        <em>Dashboard &rarr; Profile</em>, or contact us via{' '}
        <a href="/legal/support">Support &amp; Data Rights</a>. We do not discriminate against you
        for exercising these rights.
      </p>

      <h2>8. Retention</h2>
      <p>
        We keep personal data only as long as needed for the purposes above or as required by law.
        Billing and legal-acceptance records are retained for statutory periods even after account
        deletion (see the <a href="/legal/support">data-rights</a> section).
      </p>

      <h2>9. Contact</h2>
      <p>See <a href="/legal/support">Support &amp; Data Rights</a> for our privacy contact.</p>
    </article>
  );
}
