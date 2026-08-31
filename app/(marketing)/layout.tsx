import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingFooter } from '@/components/landing/LandingFooter';
import styles from './marketing.module.css';

/**
 * Shared chrome for the public content routes the hero fan points at.
 *
 * It reuses the landing header and footer rather than defining its own, for two
 * reasons: a visitor who arrives on /about from search should be one click from
 * signing up, and the footer is what keeps every one of these pages linked to
 * every other one without depending on the hero's geometry.
 *
 * No metadata is exported here. Each page owns its own title, description,
 * canonical and robots directives via `marketingMetadata()` — a shared layout
 * title would collapse six distinct search results into one.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.doc}>
      <LandingHeader />
      <main className={styles.docInner}>{children}</main>
      <LandingFooter />
    </div>
  );
}
