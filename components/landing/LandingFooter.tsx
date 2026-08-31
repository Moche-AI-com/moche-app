import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { MARKETING_ROUTES } from '@/lib/marketing/hero-links';
import styles from './landing.module.css';

// "Built in Somerville, MA" is required by LEGAL_COMPLIANCE_SPEC.md and must
// not be removed from this footer.
export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className="wrap">
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Logo href="/" size={24} />
            <p className={`muted ${styles.footerTagline}`}>Built in Somerville, MA</p>
          </div>
          <Link href="/signup" className={styles.footerCta}>
            <span>Ready when you are. Create your account</span>
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Plain text links to the same destinations as the hero fan. The hero
            is the designed entry point; this is the reliable one. It does not
            depend on the arc's geometry, it survives every viewport, and it is
            what a crawler and a screen-reader user scanning the footer for a
            site index will actually find. Same registry, so the two cannot
            drift apart. */}
        <nav className={styles.footerNav} aria-label="Site">
          {MARKETING_ROUTES.map((route) => (
            <Link key={route.href} href={route.href} className={styles.footerNavLink}>
              {route.label}
            </Link>
          ))}
        </nav>

        <LegalLinks variant="full" className={styles.footerLegal} />

        <p className={`muted ${styles.footerCopyright}`}>
          &copy; {new Date().getFullYear()} Moche-AI
        </p>
      </div>
    </footer>
  );
}
