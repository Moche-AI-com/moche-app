import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import styles from './landing.module.css';

// The Pricing and Gallery anchor links were removed deliberately. On a page
// this short they only sent people to a section they were going to scroll past
// anyway, and they crowded the two things the header is actually for: signing
// in, and starting an account.
export function LandingHeader() {
  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.headerInner}`}>
        <Logo href="/" size={28} />
        <nav aria-label="Primary" className={styles.headerNav}>
          <ThemeToggle />
          <Link href="/login" className={`btn btn-ghost btn-sm ${styles.headerBtn}`}>
            Sign in
          </Link>
          <Link href="/signup" className={`btn btn-primary btn-sm ${styles.headerBtn}`}>
            Start free today
          </Link>
        </nav>
      </div>
      <span className={styles.headerProgress} aria-hidden />
    </header>
  );
}
