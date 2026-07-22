import Link from 'next/link';
import { LEGAL_DOCS } from '@/lib/legal/registry';

export default function LegalIndexPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'clamp(1.7rem,4vw,2.4rem)', marginBottom: '.5rem' }}>Legal Center</h1>
      <p className="muted" style={{ marginBottom: '1.75rem', fontSize: '.95rem' }}>
        The agreements, policies, and disclosures that govern your use of Moche.AI. Documents
        below are drafts pending final legal review — see the banner on each page.
      </p>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        {LEGAL_DOCS.map((d) => (
          <Link
            key={d.slug}
            href={`/legal/${d.slug}`}
            className="card"
            style={{ padding: '1rem 1.15rem', textDecoration: 'none', display: 'block' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '1rem' }}>{d.title}</strong>
              <span className="faint" style={{ fontSize: '.72rem', whiteSpace: 'nowrap' }}>{d.version}</span>
            </div>
            <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>{d.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
