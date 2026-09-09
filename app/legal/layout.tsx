import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LEGAL_DOCS } from '@/lib/legal/registry';
import { LegalLinks } from '@/components/legal/LegalLinks';

export const metadata: Metadata = {
  title: 'Legal Center — Moche-AI',
  description: 'Terms, privacy, security, and compliance documents for Moche-AI.',
  robots: { index: true, follow: true },
};

// Shared chrome for every /legal page: a sticky TOC sidebar on desktop (a
// horizontally scrollable pill rail on mobile), a left-aligned reading column
// with real typographic rhythm, and a footer that links to every document.
// Print CSS hides the nav/sidebar so a saved PDF is clean.
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
        .legal-center .legal-toc-sticky { position: sticky; top: 1.5rem; }
        .legal-center .legal-toc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .35rem; }
        .legal-center .legal-toc-list a { display: inline-flex; align-items: center; min-height: 32px; }

        /* Document typography. These pages previously inherited whatever
           alignment and rhythm the surrounding chrome happened to set, which
           left binding documents reading as centred, under-spaced flyers.
           Everything is now explicitly left-aligned with a real reading
           rhythm: headings attach to their own paragraphs, lists are indented,
           and the measure tracks characters, not pixels. */
        .legal-center .legal-main { max-width: 72ch; text-align: left; }
        .legal-center .legal-main h2 { font-size: 1.25rem; line-height: 1.3; margin: 2.25rem 0 .65rem; }
        .legal-center .legal-main h3 { font-size: 1.02rem; line-height: 1.35; margin: 1.5rem 0 .45rem; }
        .legal-center .legal-main p, .legal-center .legal-main li { line-height: 1.7; font-size: .92rem; }
        .legal-center .legal-main p { margin: 0 0 1rem; }
        .legal-center .legal-main ul, .legal-center .legal-main ol { margin: 0 0 1.15rem; padding-left: 1.4rem; display: grid; gap: .45rem; }
        .legal-center .legal-main table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: .84rem; }
        .legal-center .legal-main th, .legal-center .legal-main td { border: 1px solid var(--border, rgba(255,255,255,.12)); padding: .55rem .65rem; text-align: left; vertical-align: top; }
        .legal-center .legal-main th { font-weight: 600; background: var(--surface-2, transparent); }

        @media (max-width: 860px) {
          .legal-center .legal-shell { grid-template-columns: 1fr; gap: 1.25rem; }
          /* The 13-link sidebar becomes a horizontal pill rail above the
             document: stacked vertically on a phone, the menu is a full screen
             of links between the reader and the first sentence. */
          .legal-center .legal-toc-sticky { position: static; }
          .legal-center .legal-toc-list { flex-direction: row; overflow-x: auto; gap: .4rem; padding-bottom: .35rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .legal-center .legal-toc-list::-webkit-scrollbar { display: none; }
          .legal-center .legal-toc-list li { flex: 0 0 auto; }
          .legal-center .legal-toc-list a {
            min-height: 44px;
            padding: 0 .85rem;
            border: 1px solid var(--border, rgba(127,127,127,.22));
            border-radius: 999px;
            white-space: nowrap;
            background: var(--surface, transparent);
          }
          .legal-center .legal-main h2 { margin-top: 1.85rem; }
        }
      `}</style>

      <header className="wrap legal-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72 }}>
        <Link href="/" aria-label="Moche-AI home"><Logo /></Link>
        <Link href="/" className="btn btn-ghost btn-sm">Back to site</Link>
      </header>

      <div className="wrap legal-shell" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>
        <aside className="legal-toc">
          <nav aria-label="Legal documents" className="legal-toc-sticky">
            <p className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
              Legal Center
            </p>
            <ul className="legal-toc-list">
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

        <main className="legal-main">{children}</main>
      </div>

      <footer className="wrap legal-footer" style={{ paddingBottom: '2.5rem', borderTop: '1px solid var(--border, rgba(255,255,255,.1))', paddingTop: '1.5rem' }}>
        <LegalLinks variant="full" style={{ marginBottom: '1rem' }} />
        <p className="faint" style={{ fontSize: '.72rem', margin: 0 }}>Built in Somerville, MA</p>
      </footer>
    </div>
  );
}
