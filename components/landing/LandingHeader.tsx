import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import styles from './landing.module.css';

// Simple top nav for the marketing page. Kept intentionally light -- no mobile
// drawer, no scroll-hide behaviour -- to avoid re-introducing the animated
// complexity that lived in the retired public/landing.html.
export function LandingHeader() {
  return (
    <header className={styles.landingHeader}>
      <div className={`wrap ${styles.landingHeaderInner}`}>
        <Logo href="/" size={28} />
        <nav aria-label="Primary" className={styles.landingHeaderNav}>
          <a href="#pricing" className={styles.landingHeaderLink}>
            Pricing
          </a>
          <a href="#gallery" className={styles.landingHeaderLink}>
            Gallery
          </a>
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
