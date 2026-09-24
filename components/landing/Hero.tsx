import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { HERO_LINKS } from '@/lib/marketing/hero-links';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

export function Hero() {
  return (
    <section className={styles.hero}>
      <nav className={styles.heroFan} aria-label="Explore Moche-AI">
        {HERO_LINKS.map((frame, i) => (
          <Link
            key={frame.href}
            href={frame.href}
            title={frame.description}
            className={styles.heroFanFrame}
            data-rank={frame.rank}
            data-cta={frame.cta ? '' : undefined}
            style={{
              '--fan-x': `${frame.x}%`,
              '--fan-y': `${frame.y}%`,
              '--fan-rot': `${frame.rot}deg`,
              '--fan-rank': frame.rank,
              '--fan-i': i,
              '--fan-pos': frame.pos,
            } as React.CSSProperties}
          >
            <Image
              src={frame.src}
              alt=""
              fill
              sizes="(min-width: 1100px) 15vw, (min-width: 700px) 20vw, 58vw"
              className={styles.heroFanImage}
              priority={frame.rank < 2}
            />
            <span className={styles.heroFanScrim} aria-hidden />
            <span className={styles.heroFanLabel}>
              {frame.label}
              {frame.cta ? <ArrowRight size={13} strokeWidth={2.25} aria-hidden /> : null}
            </span>
          </Link>
        ))}
      </nav>
      <div className={`wrap ${styles.heroCopy}`}>
        <Reveal as="p" eager className={styles.heroKicker}>
          Elevate your stay, get more reviews, and handle fewer questions.
        </Reveal>
        <Reveal as="h1" eager delay={60} className={styles.heroTitle}>
          Give every guest a trusted property expert
        </Reveal>
        <Reveal as="p" eager delay={130} className={styles.heroSubtitle}>
          Instant, trustworthy guest answers from the property details you approve.
        </Reveal>
        <Reveal eager delay={200} className={styles.heroActions}>
          <Link href="/signup" className="btn btn-primary btn-lg">Start free today</Link>
          <a
            href="mailto:hostspark.org@gmail.com?subject=Request%20a%20demo&body=Hi%20Moche-AI%20team%2C%0A%0AI%27d%20like%20to%20see%20a%20demo.%20Here%27s%20a%20bit%20about%20my%20properties%3A%0A%0A"
            className="btn btn-ghost btn-lg"
          >
            Request a demo
          </a>
        </Reveal>
        <Reveal as="p" eager delay={270} className={styles.heroTrialNote}>
          Moche-AI is in public beta — build and preview one property free, no card required.
          Choose a paid plan when you are ready to publish. Official launch January 1, 2027.
        </Reveal>
      </div>
    </section>
  );
}
