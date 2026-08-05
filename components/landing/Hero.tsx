import Link from 'next/link';
import Image from 'next/image';
import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Gallery-led hero. The copy block sits on the cream canvas and the property
// photography runs edge to edge beneath it, which also absorbs what used to be
// a separate "Every kind of stay" gallery section further down the page --
// having both meant the same four photos competed with themselves.
//
// Headline is taken verbatim from the approved list: the word "AI" must not
// appear in the H1 or the subheadline.
const FRAMES = [
  { src: beachhouse, alt: 'A beach house rental at sunset, framed by palm trees', weight: 1.35 },
  { src: cottage, alt: 'A coastal cottage beneath white cliffs, near the water', weight: 1 },
  { src: cabin, alt: 'Cozy cabin interior with sunlit plaid armchairs by a window', weight: 1.15 },
  { src: pool, alt: 'Modern rental home with a private pool and wood deck', weight: 1 },
  { src: handoff, alt: 'A host handing keys to an arriving guest', weight: 1.25 },
] as const;

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.heroCopy}`}>
        <Reveal as="h1" eager className={styles.heroTitle}>
          Run every property from one workspace
        </Reveal>
        <Reveal as="p" eager delay={90} className={styles.heroSubtitle}>
          One place to answer guests, keep every property&apos;s details straight, and turn more
          stays into five-star reviews.
        </Reveal>
        <Reveal eager delay={170} className={styles.heroActions}>
          <Link href="/signup" className="btn btn-primary btn-lg">
            Start free trial
          </Link>
          <a
            href="mailto:hostspark.org@gmail.com?subject=Request%20a%20demo&body=Hi%20Moche-AI%20team%2C%0A%0AI%27d%20like%20to%20see%20a%20demo.%20Here%27s%20a%20bit%20about%20my%20properties%3A%0A%0A"
            className="btn btn-ghost btn-lg"
          >
            Request a demo
          </a>
        </Reveal>
        <Reveal as="p" eager delay={240} className={styles.heroTrialNote}>
          One month free on the top tier, up to 5 properties. Card required, cancel anytime.
        </Reveal>
      </div>

      <Reveal eager delay={200} className={styles.heroStrip}>
        <ul className={styles.heroStripTrack}>
          {FRAMES.map((frame, i) => (
            <li
              key={frame.alt}
              className={styles.heroStripCell}
              style={{ '--frame-weight': frame.weight } as React.CSSProperties}
            >
              <Image
                src={frame.src}
                alt={frame.alt}
                fill
                sizes="(min-width: 1024px) 24vw, 74vw"
                className={styles.heroStripImage}
                priority={i === 0}
              />
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
