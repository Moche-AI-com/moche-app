import Link from 'next/link';
import { LEGAL_DOCS } from '@/lib/legal/registry';

// Single source of legal navigation, reused by the legal-center footer, the
// global site footer, and the compact links shown next to the Create Account /
// Checkout CTAs. Pages are read from the registry so adding a doc updates every
// surface at once.

// The subset shown in tight spaces (near CTAs). Full list used in footers.
const COMPACT_SLUGS = ['terms', 'privacy', 'refund'] as const;

export function LegalLinks({
  variant = 'full',
  className,
  style,
}: {
  variant?: 'full' | 'compact';
  className?: string;
  style?: React.CSSProperties;
}) {
  const docs =
    variant === 'compact'
      ? LEGAL_DOCS.filter((d) => (COMPACT_SLUGS as readonly string[]).includes(d.slug))
      : LEGAL_DOCS;

  return (
    <nav
      aria-label="Legal"
      className={className}
      data-testid={`legal-links-${variant}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: variant === 'compact' ? '.6rem' : '.4rem 1rem',
        fontSize: '.75rem',
        ...style,
      }}
    >
      {docs.map((d) => (
        <Link key={d.slug} href={`/legal/${d.slug}`} className="muted" style={{ textDecoration: 'none' }}>
          {d.navLabel}
        </Link>
      ))}
    </nav>
  );
}
