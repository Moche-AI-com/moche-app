import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function TermsPage() {
  return (
    <article>
      <LegalDocHeader slug="terms" />

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Moche-AI
        platform (the &ldquo;Service&rdquo;), operated by Moche-AI (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). The Service provides an AI-powered guest concierge and
        &ldquo;Property Brain&rdquo; for short-term rental (STR) hosts. By creating an account or
        using the Service, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        We let hosts assemble property knowledge and publish an AI concierge that answers guest
        questions grounded in that knowledge. The Service is intended for lawful STR hosting and
        guest-support purposes only.
      </p>

      <h2>2. Accounts &amp; eligibility</h2>
      <p>
        You must be at least 18 and provide accurate account information. You are responsible for
        activity under your account and for the content you upload to your Property Brain,
        including ensuring you have the right to upload it.
      </p>

      <h2 id="ai-disclaimer">3. AI output &mdash; nature and limits</h2>
      <p>
        <strong>You are interacting with an artificial-intelligence system</strong> (EU AI Act
        Art. 50 transparency). AI-generated answers are <strong>informational only</strong> and
        may be incomplete, out of date, or incorrect. The AI concierge is
        <strong> not a substitute for professional judgment</strong> and must not be relied on
        for emergency, medical, legal, financial, or other safety-critical decisions.
      </p>
      <p>
        <strong>In an emergency, contact local emergency services (e.g., 911 in the US, 112 in
        the EU/UK) or your host directly.</strong> The Service does not monitor conversations in
        real time and cannot dispatch help.
      </p>

      <h2 id="liability">4. Warranties &amp; limitation of liability</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>
        without warranties of any kind, whether express or implied, to the maximum extent permitted
        by law.
      </p>
      <p>
        To the maximum extent permitted by law, our aggregate liability arising out of or relating
        to the Service is <strong>limited to the total fees you paid to us in the trailing twelve
        (12) months</strong> before the event giving rise to the claim. We are not liable for
        indirect, incidental, special, consequential, or punitive damages.
      </p>

      <h2 id="indemnity">5. Indemnification</h2>
      <p>
        You will indemnify and hold us harmless from claims arising out of your content, your use
        of the Service, or your violation of these Terms or applicable law.
      </p>

      <h2>6. Subscriptions &amp; billing</h2>
      <p>
        Fees, renewal, cancellation, and refunds are governed by our{' '}
        <a href="/legal/refund">Refund &amp; Billing Policy</a>. Payments are processed by Stripe;
        we do not store your card details.
      </p>

      <h2>7. Acceptable use</h2>
      <p>
        Your use is subject to our <a href="/legal/acceptable-use">Acceptable Use Policy</a>, which
        includes model-provider restrictions flowed down to end users.
      </p>

      <h2 id="messaging">8. SMS &amp; WhatsApp messaging</h2>
      <p>
        Moche-AI offers optional SMS and WhatsApp messaging. If you opt in and verify a mobile
        number, you consent to receive <strong>account and guest-related messages</strong> from
        Moche-AI &mdash; such as new guest questions, escalations, verification codes, and
        maintenance or billing alerts. <strong>Opting in is not a condition of purchase or of
        using the Service.</strong>
      </p>
      <ul>
        <li><strong>Message frequency varies</strong> with your account activity and guest interactions.</li>
        <li><strong>Message and data rates may apply</strong> from your carrier.</li>
        <li>Reply <strong>STOP</strong> to unsubscribe at any time, or <strong>HELP</strong> for help. You can also manage messaging in <em>Dashboard &rarr; Settings</em>.</li>
        <li>Supported carriers are not liable for delayed or undelivered messages.</li>
      </ul>
      <p>
        We <strong>do not sell or share mobile opt-in data or phone numbers with third parties or
        affiliates for their marketing purposes</strong>. See how we handle messaging data in our{' '}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h2 id="law">9. Governing law &amp; disputes</h2>
      <p>
        These Terms are governed by the laws of the{' '}
        <strong>Commonwealth of Massachusetts, USA</strong>, without regard to conflict-of-laws
        rules. The exclusive venue for disputes is the state and federal courts located in
        Massachusetts, unless applicable consumer-protection law provides otherwise.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms; material changes require renewed acceptance before continued
        use. The current version and effective date appear at the top of this page.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms: see <a href="/legal/support">Support &amp; Data Rights</a>.
      </p>
    </article>
  );
}
