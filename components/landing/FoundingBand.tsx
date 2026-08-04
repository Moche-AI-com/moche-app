import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

const MAILTO_BASE = 'mailto:hostspark.org@gmail.com';

const FOUNDING_MAILTO = `${MAILTO_BASE}?subject=${encodeURIComponent(
  'Founding host application',
)}&body=${encodeURIComponent(
  "Hi Moche-AI team,\n\nI'd like to join the founding host program. Here's a bit about my portfolio:\n\n",
)}`;

// Replaces the old five-card "Pick the path that fits you" grid. That layout
// repeated the same two intents (sign up, request a demo) that already sit in
// the hero, and split attention five ways. Beta access and founding pricing
// are the same programme, so they are one offer here rather than two cards.
const PERKS = [
  'Early access to new features before general release',
  'Founding rate locked in for as long as you stay subscribed',
  'A direct line to the founder, not a ticket queue',
] as const;

export function FoundingBand() {
  return (
    <section className={styles.founding} id="founding" aria-labelledby="founding-heading">
      <div className="wrap">
        <Reveal className={styles.foundingPanel}>
          <div className={styles.foundingCopy}>
            <span className={styles.eyebrow}>Founding Host Program</span>
            <h2 id="founding-heading" className={styles.foundingTitle}>
              Join while the doors are still open
            </h2>
            <p className="muted">
              We are onboarding a small first group of hosts and property managers. You help shape
              what gets built, and your rate never goes up while you stay subscribed.
            </p>
            <ul className={styles.foundingList}>
              {PERKS.map((perk) => (
                <li key={perk} className={styles.foundingListItem}>
                  <Check size={17} strokeWidth={2.25} aria-hidden className={styles.foundingCheck} />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
            <div className={styles.foundingActions}>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Start free trial
              </Link>
              <a href={FOUNDING_MAILTO} className="btn btn-ghost btn-lg">
                Apply as a founding host
              </a>
            </div>
            <p className={`muted ${styles.foundingTrial}`}>
              The trial is one month free on the top tier, up to 5 properties. A card is required
              to start, and you can cancel any time before it ends.
            </p>
          </div>
          <div className={styles.foundingMedia}>
            <Image
              src={kitchen}
              alt="A bright, modern rental kitchen prepared for arriving guests"
              fill
              sizes="(min-width: 960px) 42vw, 100vw"
              className={styles.foundingImage}
              loading="lazy"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
