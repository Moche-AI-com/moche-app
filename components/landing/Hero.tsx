import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { SHOWCASE_LINKS } from '@/lib/marketing/hero-links';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Two-act hero. The old arc fanned seven tilted photographs above a centred
// headline; on a desktop browser that read as a photo collage, the centring
// pushed the message below the fold, and the imagery competed with the copy
// instead of supporting it.
//
// The hero is now a grid: copy on the left, the six destination documents as
// a clean, uniformly-sized card grid on the right. Every card is the same
// shape, the labels are always visible, and the layout holds from a laptop to
// a wide monitor without the imagery ballooning.
//
// Accessibility contract, unchanged from the fan:
//
//  - The showcase is a <nav> with a label; the six links are announced as a
//    group and are keyboard-traversable.
//  - Alt text stays empty. The visible label is the link's accessible name,
//    and announcing both would read every destination twice. `title` on the
//    card carries the longer description for pointer users.
//  - The entrance plays from CSS only: the hero is the first screen and must
//    not wait for hydration (see the [data-eager] reveals in globals.css).
//
// Mobile keeps the swipeable snap-carousel: six legible tiles cannot sit side
// by side on a phone, and the next card peeking in from the right edge is the
// affordance that says there is more. Same six links, same DOM order, at
// every width.
//
// Headline is taken verbatim from the approved list: the word "AI" must not
// appear in the H1 or the subheadline.
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <Reveal as="p" eager className={styles.heroBetaPill}>
            Public beta · Official launch January 1, 2027
          </Reveal>
          <Reveal as="p" eager delay={60} className={styles.heroKicker}>
            Elevate your stay, get more reviews, and handle fewer questions.
          </Reveal>
          <Reveal as="h1" eager delay={120} className={styles.heroTitle}>
            Give every guest a trusted property expert
          </Reveal>
          <Reveal as="p" eager delay={180} className={styles.heroSubtitle}>
            Instant, trustworthy guest answers from the property details you approve.
          </Reveal>
          <Reveal eager delay={240} className={styles.heroActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start free today
            </Link>
            <a
              href="mailto:hostspark.org@gmail.com?subject=Request%20a%20demo&body=Hi%20Moche-AI%20team%2C%0A%0AI%27d%20like%20to%20see%20a%20demo.%20Here%27s%20a%20bit%20about%20my%20properties%3A%0A%0A"
              className="btn btn-ghost btn-lg"
            >
              Request a demo
            </a>
          </Reveal>
          <Reveal as="p" eager delay={300} className={styles.heroTrialNote}>
            Free plan includes one property and a live guest portal — no card required. Upgrade
            whenever you are ready for more.
          </Reveal>
        </div>

        <nav className={styles.heroShowcase} aria-label="Explore Moche-AI">
          {SHOWCASE_LINKS.map((frame, i) => (
            <Link
              key={frame.href}
              href={frame.href}
              title={frame.description}
              className={styles.heroShowcaseCard}
              style={
                {
                  '--card-i': i,
                  '--card-pos': frame.pos,
                } as React.CSSProperties
              }
            >
              <Image
                src={frame.src}
                alt=""
                fill
                sizes="(min-width: 961px) 15vw, (min-width: 701px) 30vw, 64vw"
                className={styles.heroShowcaseImage}
                priority={i < 3}
              />
              {/* Scrim sits between the photograph and the label. Without it the
                  label's contrast depends on whichever part of the photo happens
                  to be under it, which fails on the pool deck and the kitchen. */}
              <span className={styles.heroShowcaseScrim} aria-hidden />
              <span className={styles.heroShowcaseLabel}>
                {frame.label}
                <ArrowUpRight size={13} strokeWidth={2.25} aria-hidden />
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
