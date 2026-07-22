import { getLegalDoc, type LegalSlug } from '@/lib/legal/registry';
import { PrintButton } from './PrintButton';

// Per-page header. Reads title/version/last-updated from the registry so those
// values live in exactly one place (see lib/legal/registry.ts).
export function LegalDocHeader({ slug }: { slug: LegalSlug }) {
  const doc = getLegalDoc(slug);
  const formatted = new Date(`${doc.lastUpdated}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <header style={{ marginBottom: '1.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border, rgba(255,255,255,.1))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', margin: 0 }}>{doc.title}</h1>
        <PrintButton />
      </div>
      <p className="muted" style={{ fontSize: '.8rem', margin: '.6rem 0 0' }}>
        <span data-testid="legal-version">Version {doc.version.replace(/^v/, '')}</span>
        {' · '}
        <span data-testid="legal-last-updated">Last updated {formatted}</span>
      </p>
    </header>
  );
}
