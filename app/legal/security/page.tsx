import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { AttorneyReview } from '@/components/legal/AttorneyReview';

export default function SecurityPage() {
  return (
    <article>
      <LegalDocHeader slug="security" />

      <p>
        This overview describes the security controls protecting the Service, grouped by the control
        families used in ISO&nbsp;27001 and SOC&nbsp;2. Our program is{' '}
        <strong>modeled on and aligned with</strong> those frameworks; we make{' '}
        <strong>no certification claim</strong>. Each control below reflects a capability that
        exists in the product today.
      </p>

      <h2>Access control</h2>
      <ul>
        <li>Supabase Postgres <strong>Row-Level Security</strong> scopes every host to their own account and properties.</li>
        <li>Guests are not database users; guest reads/writes are explicitly scoped by property and stay.</li>
        <li>The service-role key is server-only and never exposed to the browser.</li>
      </ul>

      <h2>Encryption</h2>
      <ul>
        <li>All traffic is served over <strong>TLS</strong>.</li>
        <li>Data at rest is encrypted by our database and hosting providers.</li>
        <li>Guest contact identifiers are stored as <strong>irreversible hashes</strong>, not plaintext.</li>
      </ul>

      <h2>Data protection &amp; AI routing</h2>
      <ul>
        <li><strong>PII redaction</strong> is applied to content before it is sent to any external model router (<code>lib/ai/redaction.ts</code>).</li>
        <li>Where an external router is used, we request <strong>Zero-Data-Retention</strong>; the external path is off by default.</li>
        <li>Payment card data is handled solely by Stripe (PCI-DSS) and never stored by us.</li>
      </ul>

      <h2>Logging &amp; monitoring</h2>
      <ul>
        <li>Application errors and traces are captured in <strong>Sentry</strong>.</li>
        <li>Our logger redacts secrets, tokens, emails, and long digit sequences before output.</li>
        <li>Security-relevant actions are recorded in an append-only audit log.</li>
      </ul>

      <h2>Vulnerability management</h2>
      <ul>
        <li>Dependencies are tracked and updated; the platform runs on managed, patched infrastructure (Vercel, Supabase).</li>
        <li><strong>Cloudflare Turnstile</strong> mitigates automated abuse on guest verification.</li>
      </ul>

      <h2>Incident response</h2>
      <p>
        We maintain internal runbooks for security incidents and, as a processor, commit to{' '}
        <strong>72-hour breach notification</strong> to affected controllers (see the{' '}
        <a href="/legal/dpa">DPA</a>).
      </p>

      <h2>Vendor management</h2>
      <p>
        Subprocessors are engaged under data-processing agreements and listed on our{' '}
        <a href="/legal/subprocessors">Subprocessors</a> page.
      </p>

      <AttorneyReview topic="Forward-looking / roadmap controls">
        <p>
          Any control described as planned, in progress, or roadmap (e.g., formal third-party
          certification, penetration-test cadence commitments) must be reviewed before being stated
          publicly, to avoid implying a certification or assurance we do not currently hold.
        </p>
      </AttorneyReview>
    </article>
  );
}
