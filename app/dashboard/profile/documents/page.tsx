import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, FileText } from 'lucide-react';
import { MARKETING_ROUTES } from '@/lib/marketing/hero-links';
import { LEGAL_DOCS } from '@/lib/legal/registry';

export const dynamic = 'force-dynamic';

/**
 * Every public document, reachable without leaving the dashboard: the guides
 * and product pages from the landing page, and the versioned legal documents.
 * The profile menu's "Documents" entry lands here. Both lists render from the
 * same registries the public site consumes (MARKETING_ROUTES, LEGAL_DOCS), so
 * this page can never drift out of sync with what a visitor sees.
 */
export default function ProfileDocumentsPage() {
  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Documents</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        The same pages a visitor sees on the public site: product guides, the support router, and
        every versioned legal document.
      </p>

      <h3
        className="faint"
        style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em', margin: '1.5rem 0 .75rem' }}
      >
        Guides and product pages
      </h3>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: '.85rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(15.5rem, 100%), 1fr))',
        }}
      >
        {MARKETING_ROUTES.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="card card-interactive"
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  display: 'block',
                  position: 'relative',
                  aspectRatio: '16 / 9',
                  background: 'var(--surface-2)',
                }}
              >
                {/* alt="" because the card's label is immediately adjacent and is
                    already the accessible name for this link. */}
                <Image
                  src={r.src}
                  alt=""
                  fill
                  sizes="(max-width: 720px) 100vw, 340px"
                  style={{ objectFit: 'cover' }}
                />
              </span>
              <span style={{ padding: '.85rem .95rem 1rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                <span style={{ fontSize: '.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  {r.label}
                  <ArrowUpRight size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />
                </span>
                <span className="muted" style={{ fontSize: '.83rem', lineHeight: 1.5 }}>
                  {r.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h3
        className="faint"
        style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em', margin: '2rem 0 .75rem' }}
      >
        Legal and policies
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.6rem' }}>
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="card card-interactive"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1rem 1.15rem',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', minWidth: 0 }}>
                <FileText size={16} aria-hidden style={{ color: 'var(--teal)', flexShrink: 0, marginTop: '.15rem' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '.92rem', fontWeight: 600 }}>{d.title}</span>
                  <span className="muted" style={{ display: 'block', fontSize: '.8rem', lineHeight: 1.5, marginTop: '.15rem' }}>
                    {d.summary}
                  </span>
                </span>
              </span>
              <span className="faint" style={{ fontSize: '.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                v{d.version.replace(/^v/, '')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
