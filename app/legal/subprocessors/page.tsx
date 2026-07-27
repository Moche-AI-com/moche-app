import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { SubprocessorTable } from '@/components/legal/SubprocessorTable';
import { SUBPROCESSORS } from '@/lib/legal/subprocessors';

export default function SubprocessorsPage() {
  // Only explain the "not currently active" marker when at least one vendor actually
  // carries it, so the note never contradicts the table above it.
  const hasInactive = SUBPROCESSORS.some((s) => !s.active);

  return (
    <article>
      <LegalDocHeader slug="subprocessors" />
      <p>
        We use the third-party service providers (&ldquo;subprocessors&rdquo;) below to deliver the
        Service. Each processes personal data only under a data-processing agreement and only for
        the stated purpose. This same list backs Schedule&nbsp;3 of our{' '}
        <a href="/legal/dpa">Data Processing Addendum</a>.
      </p>
      <SubprocessorTable />
      {hasInactive && (
        <p className="muted" style={{ fontSize: '.82rem', marginTop: '1rem' }}>
          Vendors marked &ldquo;not currently active&rdquo; have an integration path in the product
          but are not processing data today. We will update this page before enabling them.
        </p>
      )}
      <p className="muted" style={{ fontSize: '.82rem', marginTop: '1rem' }}>
        AI model providers are reached through our model router (OpenRouter) under a
        zero-data-retention configuration; see the{' '}
        <a href="/legal/ai-policy">AI Policy</a> for which models handle which task and the
        safeguards applied before any content leaves our infrastructure.
      </p>
    </article>
  );
}
