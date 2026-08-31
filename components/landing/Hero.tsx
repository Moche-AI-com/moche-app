import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { HERO_LINKS } from '@/lib/marketing/hero-links';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Gallery-led hero. The property photography is fanned in an arc above the
// headline rather than sitting in a strip beneath it: the copy stays the single
// focal point and the photography frames it instead of competing with it.
//
// The fan is no longer decorative. It was seven aria-hidden photographs with a
// hover lift and no destination, which spent the most valuable real estate on the
// site on nothing and left every public route except /legal orphaned from the
// homepage. Each frame is now a link, and the centre frame is the signup CTA.
//
// Consequences of that change, all deliberate:
//
//  - The container is a <nav>, not an aria-hidden <div>. Seven links need to be
//    announced and grouped, and a screen reader reaching the H1 through a
//    labelled nav is a normal experience, whereas reaching it through seven
//    unlabelled images was the reason the fan was hidden in the first place.
//  - Alt text stays empty. The visible label is the link's accessible name, and
//    announcing both would read every destination twice. `title` on the frame
//    carries the longer description for pointer users.
//  - Every frame has an always-visible label chip. Discoverability cannot depend
//    on hover: there is no hover on a phone, and a clickable thing that looks
//    identical to the decorative version it replaced has not been made clickable
//    in any way a visitor can perceive.
//
// Geometry, destinations and crop anchors all live in lib/marketing/hero-links.ts
// so the sitemap and the footer can consume the same list. `rank` is distance
// from centre and drives z-order plus the arc's proportions. It no longer hides
// anything: the old CSS dropped rank 3 under 700px and rank 2 under 430px, which
// silently removed four of the seven destinations on a phone. Under 700px the arc
// becomes a grid instead, so all seven stay reachable at every width.
//
// Headline is taken verbatim from the approved list: the word "AI" must not
// appear in the H1 or the subheadline.
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
            style={
              {
                '--fan-x': `${frame.x}%`,
                '--fan-y': `${frame.y}%`,
                '--fan-rot': `${frame.rot}deg`,
                '--fan-rank': frame.rank,
                '--fan-i': i,
                '--fan-pos': frame.pos,
              } as React.CSSProperties
            }
          >
            <Image
              src={frame.src}
              alt=""
              fill
              sizes="(min-width: 1100px) 15vw, (min-width: 700px) 20vw, 34vw"
              className={styles.heroFanImage}
              priority={frame.rank < 2}
            />
            {/* Scrim sits between the photograph and the label. Without it the
                label's contrast depends on whichever part of the photo happens
                to be under it, which fails on the pool deck and the kitchen. */}
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
        <Reveal as="p" eager delay={270} className={styles.heroTrialNote}>
          Moche-AI launches January 1, 2027. Early accounts are free until then, with no charge before
          launch.
        </Reveal>
      </div>
    </section>
  );
}
