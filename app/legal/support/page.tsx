import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function SupportPage() {
  return (
    <article>
      <LegalDocHeader slug="support" />

      <p>
        We&rsquo;re here to help hosts and guests get the most out of Moche-AI. This page explains
        how to reach us, our response targets, and how to exercise your data rights.
      </p>

      <h2>Getting help</h2>
      <p>
        Hosts can reach support from the dashboard or by email. Guests should contact their host
        directly for property-specific matters (check-in, access, on-site issues); the AI concierge
        can also escalate a question to the host for you.
      </p>

      <h2>Response targets</h2>
      <table>
        <thead>
          <tr><th>Request type</th><th>Target first response</th></tr>
        </thead>
        <tbody>
          <tr><td>General support</td><td>Within 2 business days</td></tr>
          <tr><td>Billing issues</td><td>Within 1 business day</td></tr>
          <tr><td>Security reports</td><td>Within 24 hours</td></tr>
          <tr><td>Data-rights requests</td><td>Acknowledged promptly; fulfilled within statutory timeframes (e.g., 30 days under GDPR)</td></tr>
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: '.8rem' }}>
        Targets are goals, not contractual guarantees, unless stated in an enterprise agreement.
      </p>

      <h2>Exercising your data rights</h2>
      <p>
        Hosts can <strong>export</strong> or <strong>delete</strong> their data directly from{' '}
        <em>Dashboard &rarr; Profile</em>:
      </p>
      <ul>
        <li><strong>Export (portability):</strong> download a JSON copy of your account, properties, and content. Payment card data is not included (held by Stripe).</li>
        <li><strong>Deletion (erasure):</strong> a two-step request &rarr; confirm flow removes personal and property data. Billing, legal-acceptance, and audit records are retained where required by tax and compliance law.</li>
      </ul>
      <p>
        Guests, or anyone who cannot access the dashboard, can submit a data-rights request through
        our support channel and we will verify and action it.
      </p>

      <h2>Security contact</h2>
      <p>
        To report a vulnerability or suspected incident, contact our security channel; we aim to
        acknowledge within 24 hours. As a processor we notify affected controllers of qualifying
        breaches within 72 hours (see the <a href="/legal/dpa">DPA</a>).
      </p>
    </article>
  );
}
