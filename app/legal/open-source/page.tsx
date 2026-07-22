import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function OpenSourcePage() {
  return (
    <article>
      <LegalDocHeader slug="open-source" />

      <p>
        Moche.AI is built with open-source software and AI models. We are grateful to the
        communities behind them and provide the attributions and license notices below. A complete
        machine-readable list is maintained in{' '}
        <code>THIRD_PARTY_LICENSES.md</code> in our source repository.
      </p>

      <h2>AI models</h2>
      <p>
        <strong>Built with Meta Llama&nbsp;3.</strong> Where a Llama&nbsp;3 model is used, it is
        used under the <strong>Meta Llama&nbsp;3 Community License</strong> and its Acceptable Use
        Policy, whose restrictions are flowed down in our{' '}
        <a href="/legal/acceptable-use">Acceptable Use Policy</a>. Our primary production model
        provider is OpenAI (commercial API terms); see{' '}
        <a href="/legal/subprocessors">Subprocessors</a>.
      </p>

      <h2>Libraries &amp; licenses</h2>
      <p>
        The Service depends on software distributed under permissive licenses including{' '}
        <strong>MIT</strong> and <strong>Apache&nbsp;2.0</strong> (for example, the Next.js and
        React ecosystems and the Supabase client libraries). Each library remains subject to its own
        license; copies of those licenses are reproduced in{' '}
        <code>THIRD_PARTY_LICENSES.md</code>.
      </p>

      <h2>Notices</h2>
      <p>
        Trademarks (including Meta, Llama, and OpenAI) are the property of their respective owners.
        Reference to a model or library does not imply endorsement.
      </p>
    </article>
  );
}
