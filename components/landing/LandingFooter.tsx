import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { LegalLinks } from '@/components/legal/LegalLinks';
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

        <LegalLinks variant="full" className={styles.footerLegal} />

        <p className={`muted ${styles.footerCopyright}`}>
          &copy; {new Date().getFullYear()} Moche-AI
        </p>
      </div>
    </footer>
  );
}
