import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function MsaPage() {
  return (
    <article>
      <LegalDocHeader slug="msa" />

      <p>
        This Master Service Agreement (&ldquo;MSA&rdquo;) is offered to enterprise customers in
        place of the standard <a href="/legal/terms">Terms of Service</a> and takes effect when
        completed by an executed Order Form. If you have not signed an Order Form, the{' '}
        <a href="/legal/terms">Terms of Service</a> govern your use of the Service instead.
      </p>

      <h2>1. Structure</h2>
      <p>
        This MSA governs all Order Forms between the parties. Each Order Form specifies the
        subscribed plan, fees, and term, and incorporates this MSA and the{' '}
        <a href="/legal/dpa">Data Processing Addendum</a>.
      </p>

      <h2>2. Services &amp; support</h2>
      <p>
        Moche-AI will provide the Service and support described in the applicable Order Form and our{' '}
        <a href="/legal/support">Support</a> policy.
      </p>

      <h2>3. Fees</h2>
      <p>
        Fees are set out in the Order Form and are due per the stated billing terms. Refund and
        cancellation mechanics follow our <a href="/legal/refund">Refund &amp; Billing Policy</a>
        {' '}unless the Order Form states otherwise.
      </p>

      <h2>4. Confidentiality</h2>
      <p>
        Each party will protect the other&rsquo;s confidential information with reasonable care and
        use it only to perform under this MSA.
      </p>

      <h2 id="liability">5. Warranties &amp; limitation of liability</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo;</strong> to the maximum extent
        permitted by law. <strong>Consistent with our Terms of Service</strong>, each
        party&rsquo;s aggregate liability is <strong>limited to the fees paid in the trailing
        twelve (12) months</strong> before the event giving rise to the claim, and neither party
        is liable for indirect, incidental, or consequential damages. AI-output disclaimers in the
        Terms apply equally here.
      </p>

      <h2 id="law">6. Governing law</h2>
      <p>
        This MSA is governed by the laws of the{' '}
        <strong>Commonwealth of Massachusetts, USA</strong>, with exclusive venue in the state and
        federal courts located in Massachusetts &mdash; identical to the Terms of Service.
      </p>

      <h2>7. Term &amp; termination</h2>
      <p>
        This MSA continues while any Order Form is in effect. Either party may terminate for
        uncured material breach on 30 days&rsquo; written notice.
      </p>
    </article>
  );
}
