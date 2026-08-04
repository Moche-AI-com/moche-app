import Link from 'next/link';
import Image from 'next/image';
import heroPhoto from '@/public/premium/str-hero-beachhouse.webp';
import styles from './landing.module.css';

// Hero copy is operational/value-driven per the product language rules: the
// word "AI" must not appear in the H1 or subheadline, and the headline is
// pulled verbatim from the approved list in BRIEF-SHARED.md. Split-screen
// layout (copy + real photo) instead of a centered hero, per the project's
// anti-center-bias guidance.
export function Hero() {
  return (
    <section className={styles.heroSection}>
      <div className={`wrap ${styles.heroSectionInner}`}>
        <div className={styles.heroSectionCopy}>
          <span className="badge badge-teal">Founding Host Program</span>
          <h1 className={styles.heroSectionTitle}>Run every property from one workspace</h1>
          <p className={styles.heroSectionSubtitle}>
            Moche-AI gives hosts and property managers a single place to answer guests, track
            every property&apos;s knowledge, and turn more stays into five-star reviews.
          </p>
          <div className={styles.heroSectionActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Sign up
            </Link>
            <a
              href="mailto:hostspark.org@gmail.com?subject=Request%20a%20demo&body=Hi%20Moche-AI%20team%2C%0A%0AI%27d%20like%20to%20see%20a%20demo.%20Here%27s%20a%20bit%20about%20my%20properties%3A%0A%0A"
              className="btn btn-ghost btn-lg"
            >
              Request a demo
            </a>
          </div>
        </div>
        <div className={styles.heroSectionMedia}>
          <Image
            src={heroPhoto}
            alt="A short-term rental beach house at sunset, framed by palm trees"
            fill
            sizes="(min-width: 1024px) 480px, 100vw"
            className={styles.heroSectionImage}
            priority
          />
        </div>
      </div>
    </section>
  );
}
