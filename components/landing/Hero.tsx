import type { StaticImageData } from 'next/image';
import Image from 'next/image';
import Link from 'next/link';

import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import portal from '@/public/premium/portal-hero.jpg';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

type FanFrameId =
  | 'beachhouse'
  | 'pool'
  | 'cabin'
  | 'portal'
  | 'cottage'
  | 'kitchen'
  | 'handoff';

type FanFrame = {
  id: FanFrameId;
  src: StaticImageData;
  loading: 'lcp' | 'default' | 'lazy';
};

const FAN = [
  { id: 'beachhouse', src: beachhouse, loading: 'lazy' },
  { id: 'pool', src: pool, loading: 'lazy' },
  { id: 'cabin', src: cabin, loading: 'default' },
  { id: 'portal', src: portal, loading: 'lcp' },
  { id: 'cottage', src: cottage, loading: 'default' },
  { id: 'kitchen', src: kitchen, loading: 'lazy' },
  { id: 'handoff', src: handoff, loading: 'lazy' },
] as const satisfies readonly FanFrame[];

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroFan} aria-hidden="true">
        {FAN.map((frame) => {
          const isLcp = frame.loading === 'lcp';
          const isExplicitlyLazy = frame.loading === 'lazy';
          return (
            <div
              key={frame.id}
              className={styles.heroFanFrame}
              data-frame={frame.id}
            >
              <Image
                src={frame.src}
                alt=""
                fill
                sizes="(max-width: 430px) 31vw, (max-width: 700px) 22vw, 13vw"
                className={styles.heroFanImage}
                placeholder="blur"
                priority={isLcp}
                fetchPriority={isLcp ? 'high' : 'auto'}
                loading={isExplicitlyLazy ? 'lazy' : undefined}
              />
            </div>
          );
        })}
      </div>
      <div className={`wrap ${styles.heroCopy}`}>
        <Reveal as="p" eager className={styles.heroKicker}>
          Elevate your stay, get more reviews, and handle fewer questions.
        </Reveal>
        <Reveal
          as="h1"
          id="hero-title"
          eager
          delay={60}
          className={styles.heroTitle}
        >
          Give every property its own concierge agent
        </Reveal>
        <Reveal
          as="p"
          eager
          delay={130}
          className={styles.heroSubtitle}
        >
          One place for instant, trustworthy answers to every guest request—so
          you get fewer interruptions and more five-star reviews.
        </Reveal>
        <Reveal eager delay={200} className={styles.heroActions}>
          <Link href="/signup" className="btn btn-primary btn-lg">
            Start free today
          </Link>
          {/* TODO(demo): restore href="/demo" once that route is built and functional. */}
          <Link href="/signup" className="btn btn-ghost btn-lg">
            Request a demo
          </Link>
        </Reveal>
        <Reveal
          as="ul"
          eager
          delay={235}
          className={styles.heroProofPoints}
        >
          <li>No guest app or login</li>
          <li>Answers from your property details</li>
          <li>Escalates when it is not sure</li>
        </Reveal>
        <Reveal
          as="p"
          eager
          delay={270}
          className={styles.heroTrialNote}
        >
          One month free for up to 5 properties. Card required; cancel anytime.{' '}
          <Link href="/trial-terms">See full trial terms</Link>.
        </Reveal>
      </div>
    </section>
  );
}
