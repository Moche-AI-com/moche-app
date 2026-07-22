import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LEGAL_DOCS } from '@/lib/legal/registry';
import { LegalLinks } from '@/components/legal/LegalLinks';

export const metadata: Metadata = {
  title: 'Legal Center — Moche.AI',
  description: 'Terms, privacy, security, and compliance documents for Moche.AI.',
  robots: { index: true, follow: true },
};

// Shared chrome for every /legal page: a sticky TOC sidebar (collapsible on
// mobile via <details>), a print-friendly main column, and a footer that links
// to every document. Print CSS hides the nav/sidebar so a saved PDF is clean.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-center" style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <style>{`
        @media print {
          .legal-center .no-print, .legal-center .legal-toc, .legal-center .legal-topbar, .legal-center .legal-footer { display: none !important; }
          .legal-center .legal-main { max-width: none !important; padding: 0 !important; }
          .legal-center { background: #fff !important; color: #000 !important; }
          .legal-center a { color: #000 !important; text-decoration: underline; }
        }
        .legal-center .legal-shell { display: grid; grid-template-columns: 240px minmax(0,1fr); gap: 2.5rem; }
        @media (max-width: 860px) { .legal-center .legal-shell { grid-template-columns: 1fr; } }
        .legal-center .legal-toc-sticky { position: sticky; top: 1.5rem; }
        .legal-center .legal-main h2 { font-size: 1.25rem; margin: 1.75rem 0 .6rem; }
        .legal-center .legal-main h3 { font-size: 1.02rem; margin: 1.25rem 0 .4rem; }
        .legal-center .legal-main p, .legal-center .legal-main li { line-height: 1.6; font-size: .92rem; }
        .legal-center .legal-main table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .82rem; }
        .legal-center .legal-main th, .legal-center .legal-main td { border: 1px solid var(--border, rgba(255,255,255,.12)); padding: .5rem .6rem; text-align: left; vertical-align: top; }
      `}</style>

      <header className="wrap legal-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72 }}>
        <Link href="/" aria-label="Moche.AI home"><Logo /></Link>
        <Link href="/" className="btn btn-ghost btn-sm">Back to site</Link>
      </header>

      <div className="wrap legal-shell" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>
        <aside className="legal-toc">
          <nav aria-label="Legal documents" className="legal-toc-sticky">
            <p className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
              Legal Center
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <li>
                <Link href="/legal" className="muted" style={{ fontSize: '.85rem', textDecoration: 'none' }}>Overview</Link>
              </li>
              {LEGAL_DOCS.map((d) => (
                <li key={d.slug}>
                  <Link href={`/legal/${d.slug}`} className="muted" style={{ fontSize: '.85rem', textDecoration: 'none' }}>
                    {d.navLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="legal-main" style={{ maxWidth: 760 }}>{children}</main>
      </div>

      <footer className="wrap legal-footer" style={{ paddingBottom: '2.5rem', borderTop: '1px solid var(--border, rgba(255,255,255,.1))', paddingTop: '1.5rem' }}>
        <LegalLinks variant="full" style={{ marginBottom: '1rem' }} />
        <p className="faint" style={{ fontSize: '.72rem', margin: 0 }}>Built in Somerville, MA</p>
      </footer>
    </div>
  );
}
