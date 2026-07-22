import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function AcceptableUsePage() {
  return (
    <article>
      <LegalDocHeader slug="acceptable-use" />

      <p>
        This Acceptable Use Policy (&ldquo;AUP&rdquo;) applies to all use of the Service and is part
        of the <a href="/legal/terms">Terms of Service</a>. It also flows down restrictions required
        by the providers of the AI models we may use.
      </p>

      <h2>1. Prohibited uses</h2>
      <ul>
        <li>Unlawful, fraudulent, or infringing activity, or violating others&rsquo; privacy.</li>
        <li>Uploading content you lack the rights to, or that is defamatory, harassing, or hateful.</li>
        <li>Attempting to generate advice for emergency, medical, legal, or financial reliance and presenting AI output as professional advice.</li>
        <li>Probing, scanning, or breaching security; circumventing rate limits or access controls.</li>
        <li>Using the Service to build a competing model or to scrape/extract other users&rsquo; data.</li>
        <li>Generating content that sexualizes minors, promotes violence, or facilitates illegal weapons/CSAM/terrorism.</li>
      </ul>

      <h2>2. Model-provider restrictions (flow-down)</h2>
      <p>
        Some AI capabilities are governed by upstream model licenses and acceptable-use policies. To
        the extent any request is served by a model licensed under the{' '}
        <strong>Meta Llama&nbsp;3 Community License and Acceptable Use Policy</strong>, you agree not
        to use outputs in the ways that license prohibits (including the uses listed above), and the
        same restrictions flow down to your guests. This flow-down applies regardless of which model
        actually serves a given request. See our{' '}
        <a href="/legal/open-source">Open-Source &amp; Model Attributions</a>.
      </p>

      <h2>3. Enforcement</h2>
      <p>
        We may investigate suspected violations and suspend or terminate access, remove content, or
        report unlawful activity. Serious or repeated violations may result in immediate termination
        without refund.
      </p>

      <h2>4. Reporting</h2>
      <p>Report abuse via <a href="/legal/support">Support &amp; Data Rights</a>.</p>
    </article>
  );
}
