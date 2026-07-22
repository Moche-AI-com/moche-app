import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { AttorneyReview } from '@/components/legal/AttorneyReview';
import { SubprocessorTable } from '@/components/legal/SubprocessorTable';

export default function DpaPage() {
  return (
    <article>
      <LegalDocHeader slug="dpa" />

      <AttorneyReview topic="Entire Data Processing Addendum">
        <p>
          This DPA is a template pending legal review. It forms part of the{' '}
          <a href="/legal/terms">Terms of Service</a> and applies where Moche.AI processes personal
          data on a customer&rsquo;s behalf (GDPR Art. 28). By accepting during signup or checkout,
          the customer (&ldquo;Controller&rdquo;) and Moche.AI (&ldquo;Processor&rdquo;) agree to
          these terms.
        </p>
      </AttorneyReview>

      <h2>1. Roles &amp; scope</h2>
      <p>
        The Controller determines the purposes and means of processing property and guest data. The
        Processor processes such data only on documented instructions from the Controller, including
        for international transfers, unless required by law.
      </p>

      <h2>2. Processor obligations</h2>
      <ul>
        <li>Process only on the Controller&rsquo;s documented instructions.</li>
        <li>Ensure personnel are bound by confidentiality.</li>
        <li>Implement the technical &amp; organizational measures in Schedule&nbsp;2.</li>
        <li>Assist the Controller with data-subject requests and security/DPIA obligations.</li>
        <li>Delete or return personal data at the end of the engagement, subject to legal retention.</li>
        <li>Make available information necessary to demonstrate compliance.</li>
      </ul>

      <h2 id="breach">3. Breach notification</h2>
      <AttorneyReview topic="Breach-notification timing">
        <p>
          The Processor will notify the Controller <strong>without undue delay and in any event
          within 72 hours</strong> of becoming aware of a personal-data breach affecting the
          Controller&rsquo;s data, with the information reasonably available. See our{' '}
          <a href="/legal/security">Security Overview</a> and internal security-incident runbook.
        </p>
      </AttorneyReview>

      <h2>4. Subprocessors</h2>
      <p>
        The Controller authorizes the use of the subprocessors listed in Schedule&nbsp;3. We impose
        data-protection obligations on each subprocessor no less protective than this DPA and remain
        liable for their performance. We will give notice of intended changes and allow a
        reasonable <strong>objection right</strong>.
      </p>

      <h2 id="transfers">5. International transfers</h2>
      <AttorneyReview topic="Transfer mechanism">
        <p>
          For transfers outside the EEA/UK, the parties incorporate the EU{' '}
          <strong>Standard Contractual Clauses</strong> and the{' '}
          <strong>UK IDTA/Addendum</strong>, with the Processor as &ldquo;data importer&rdquo; where
          applicable.
        </p>
      </AttorneyReview>

      <h2 id="ccpa">6. CCPA service-provider terms</h2>
      <AttorneyReview topic="CCPA service-provider status">
        <p>
          To the extent the CCPA/CPRA applies, Moche.AI acts as a <strong>service provider</strong>:
          we do not sell or share personal information and do not retain, use, or disclose it except
          to provide the Service or as permitted by the CCPA.
        </p>
      </AttorneyReview>

      <h2>Schedule 1 — Processing details</h2>
      <table>
        <tbody>
          <tr><td><strong>Subject matter</strong></td><td>Provision of the AI guest-concierge and Property Brain.</td></tr>
          <tr><td><strong>Duration</strong></td><td>For the term of the subscription.</td></tr>
          <tr><td><strong>Nature &amp; purpose</strong></td><td>Storage, retrieval, embedding, and AI-based answering of property/guest content.</td></tr>
          <tr><td><strong>Data subjects</strong></td><td>The Controller&rsquo;s guests and staff.</td></tr>
          <tr><td><strong>Data categories</strong></td><td>Property content, guest questions/answers, hashed guest contact identifiers.</td></tr>
        </tbody>
      </table>

      <h2>Schedule 2 — Technical &amp; organizational measures</h2>
      <p>
        The measures in our <a href="/legal/security">Security Overview</a> (access control,
        encryption in transit and at rest, logging &amp; monitoring, vulnerability management,
        incident response, vendor management, and data protection including PII redaction before
        external AI routing) are incorporated here by reference.
      </p>

      <h2>Schedule 3 — Authorized subprocessors</h2>
      <SubprocessorTable />
    </article>
  );
}
