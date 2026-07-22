import { LegalDocHeader } from '@/components/legal/LegalDocHeader';
import { SubprocessorTable } from '@/components/legal/SubprocessorTable';

export default function SubprocessorsPage() {
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
      <p className="muted" style={{ fontSize: '.82rem', marginTop: '1rem' }}>
        Vendors marked &ldquo;not currently active&rdquo; have an integration path in the product
        but are not processing data today. We will update this page before enabling them.
      </p>
    </article>
  );
}
