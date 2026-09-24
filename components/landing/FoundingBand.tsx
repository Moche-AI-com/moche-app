import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import {
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
} from '@/lib/constants';

const PERKS = [
  `If available at paid checkout, ${FOUNDING_DISCOUNT_PERCENT}% off your first ${FOUNDING_DISCOUNT_MONTHS} months of billing`,
  'Build one draft property and preview the guest portal free — no card required',
  'Early access to new features before general release',
  'A direct line to the founder, not a ticket queue',
] as const;

const STEPS = [
  { title: 'Create your account', body: 'Email and a password. No card required to start building.' },
  { title: 'Build your Property Brain', body: 'Add a property and preview what guests will see.' },
  { title: 'Choose a plan when ready', body: 'Review your price and any founding discount at checkout, then publish for guests.' },
] as const;

export function FoundingBand() {
  return (
    <section className={styles.founding} id="founding" aria-labelledby="founding-heading">
      <div className="wrap">
        <Reveal className={styles.foundingPanel}>
          <div className={styles.foundingCopy}>
            <span className={styles.eyebrow}>Founding Host Program</span>
            <h2 id="founding-heading" className={styles.foundingTitle}>
              Build free. Save on your first paid year if the founding offer is open.
            </h2>
            <p className="muted">
              Moche-AI is in public beta ahead of our January 1, 2027 launch.
              Create an account and preview your guest experience free. A paid plan is
              required to publish; eligible founding discounts are confirmed at checkout.
            </p>
            <ul className={styles.foundingList}>
              {PERKS.map((perk) => (
                <li key={perk} className={styles.foundingListItem}>
                  <Check size={17} strokeWidth={2.25} aria-hidden className={styles.foundingCheck} />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
            <ol className={styles.foundingSteps}>
              {STEPS.map((step, index) => (
                <li key={step.title} className={styles.foundingStep}>
                  <span className={styles.foundingStepNum} aria-hidden>{index + 1}</span>
                  <span className={styles.foundingStepBody}>
                    <strong className={styles.foundingStepTitle}>{step.title}</strong>
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.foundingActions}>
              <Link href="/signup" className="btn btn-primary btn-lg">Start building free</Link>
            </div>
            <p className={`muted ${styles.foundingTrial}`}>
              The founding discount is limited to the first {FOUNDING_ACCOUNT_CAP} eligible
              accounts to start a paid plan. After {FOUNDING_DISCOUNT_MONTHS} discounted
              months, standard pricing applies. See <Link href="/founding-terms">founding host terms</Link>.
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
