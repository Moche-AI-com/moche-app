import Link from 'next/link';
import Image from 'next/image';
import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import kitchen from '@/public/premium/str-gallery-kitchen.webp';
import pool from '@/public/premium/str-gallery-desert-pool.webp';
import handoff from '@/public/premium/str-gallery-handoff.webp';
import portal from '@/public/premium/portal-hero.jpg';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Gallery-led hero. The property photography is fanned in an arc above the
// headline rather than sitting in a strip beneath it: the copy stays the single
// focal point and the photography frames it instead of competing with it.
//
// The fan is decorative -- aria-hidden, and every alt is empty -- because the
// same properties are described in the copy and a screen reader gaining seven
// photo descriptions before the H1 is worse than gaining none.
//
// Headline is taken verbatim from the approved list: the word "AI" must not
// appear in the H1 or the subheadline.
//
// Geometry is data, not markup: each frame carries its own offset, lift and
// rotation, and the CSS reads them. `rank` drives responsive culling -- the
// outermost pair (rank 3) is dropped under 700px, the next pair (rank 2) under
// 430px, so the arc thins out instead of overlapping into mush.
//
// `pos` is the crop anchor. These frames are tall 3:4 windows onto photographs
// that were not shot for that ratio, and a centred crop of the beach house is
// two thirds empty sky -- it read as a blank card next to six photographs.
const FAN = [
  { src: beachhouse, x: -46, y: 26, rot: -21, rank: 3, pos: '50% 86%' },
  { src: pool, x: -31, y: 11, rot: -14, rank: 2, pos: '50% 62%' },
  { src: cabin, x: -16, y: 2, rot: -7, rank: 1, pos: '50% 50%' },
  { src: portal, x: 0, y: -3, rot: 0, rank: 0, pos: '50% 45%' },
  { src: cottage, x: 16, y: 2, rot: 7, rank: 1, pos: '50% 55%' },
  { src: kitchen, x: 31, y: 11, rot: 14, rank: 2, pos: '50% 55%' },
  { src: handoff, x: 46, y: 26, rot: 21, rank: 3, pos: '50% 50%' },
] as const;

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroFan} aria-hidden>
        {FAN.map((frame, i) => (
          <div
            key={i}
            className={styles.heroFanFrame}
            data-rank={frame.rank}
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
              sizes="(min-width: 1100px) 15vw, (min-width: 700px) 20vw, 30vw"
              className={styles.heroFanImage}
              priority={frame.rank < 2}
            />
          </div>
        ))}
      </div>

      <div className={`wrap ${styles.heroCopy}`}>
        <Reveal as="p" eager className={styles.heroKicker}>
          Elevate your stay, get more reviews, and handle fewer questions.
        </Reveal>
        <Reveal as="h1" eager delay={60} className={styles.heroTitle}>
          Run every property from one workspace
        </Reveal>
        <Reveal as="p" eager delay={130} className={styles.heroSubtitle}>
          One place to answer guests, keep every property&apos;s details straight, and turn more stays into five-star reviews.
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
          One month free on the top tier, up to 5 properties. Card required, cancel anytime.
        </Reveal>
      </div>
    </section>
  );
}
