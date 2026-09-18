import Link from 'next/link';
import { Logo } from '@/components/Logo';
import styles from './landing.module.css';

// The Pricing and Gallery anchor links were removed deliberately. On a page
// this short they only sent people to a section they were going to scroll past
// anyway, and they crowded the two things the header is actually for: signing
// in, and starting an account.
//
// Theme note: the signed-out marketing surface (the landing page and the
// (marketing) routes that reuse this header) is light-only by design. The
// ThemeToggle that used to sit in this nav was removed because it isn't needed
// on the landing page. The inline script below runs before paint and pins
// data-theme to light so a returning visitor whose stored preference is dark
// doesn't see a dark landing page. The stored 'moche-theme' value is left
// untouched, so the choice still applies after sign-in: the dashboard keeps
// its own toggle in ProfileMenu and full light/dark switching.
const FORCE_LIGHT = `document.documentElement.setAttribute('data-theme','light')`;

export function LandingHeader() {
  return (
    <header className={styles.header}>
      <script dangerouslySetInnerHTML={{ __html: FORCE_LIGHT }} />
      <div className={`wrap ${styles.headerInner}`}>
        <Logo href="/" size={28} />
        <nav aria-label="Primary" className={styles.headerNav}>
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
