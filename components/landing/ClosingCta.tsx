import Link from 'next/link';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import {
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
} from '@/lib/constants';

const MAILTO = 'mailto:hostspark.org@gmail.com';
const DEMO_MAILTO = `${MAILTO}?subject=${encodeURIComponent('Beta access — request a demo')}&body=${encodeURIComponent("Hi Moche-AI team,\n\nI'd like a demo before I start. Here's a bit about my properties:\n\n")}`;
const SALES_MAILTO = `${MAILTO}?subject=${encodeURIComponent('Beta access — talk to sales')}&body=${encodeURIComponent("Hi Moche-AI team,\n\nI'd like to talk through a plan for my portfolio. Here's how it's structured:\n\n")}`;

const INCENTIVES = [
  {
    label: `${FOUNDING_DISCOUNT_PERCENT}% off for ${FOUNDING_DISCOUNT_MONTHS} months`,
    detail: `Available to the first ${FOUNDING_ACCOUNT_CAP} eligible accounts that start a paid plan, if the offer is still open at checkout. Creating a free account does not reserve it.`,
  },
  {
    label: 'Start building today',
    detail: 'Add a draft property and preview its guest portal for free. Choose a paid plan to publish; no setup fee.',
  },
  {
    label: 'Support that is a person',
    detail: 'Beta hosts reach the founder directly while the group is still small.',
  },
] as const;

export function ClosingCta() {
  return (
    <section className={styles.closing} id="get-started" aria-labelledby="closing-heading">
      <div className="wrap">
        <div className={styles.closingInner}>
          <Reveal as="span" className={styles.eyebrow}>Beta access &amp; founding members</Reveal>
          <Reveal as="h2" id="closing-heading" className={styles.closingTitle}>
            Elevate your stay, get more reviews, and handle fewer questions.
          </Reveal>
          <Reveal as="p" delay={70} className={styles.closingLead}>
            Build and preview free, or have us walk you through it first.
            Choose a paid plan when you are ready to publish for guests.
          </Reveal>
          <Reveal delay={140} className={styles.closingActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">Start free today</Link>
            <a href={DEMO_MAILTO} className="btn btn-ghost btn-lg">Request a demo</a>
            <a href={SALES_MAILTO} className={styles.closingTextLink}>Contact sales</a>
          </Reveal>
          <dl className={styles.closingPerks}>
            {INCENTIVES.map((item, i) => (
              <Reveal key={item.label} delay={200 + i * 60} className={styles.closingPerk}>
                <dt className={styles.closingPerkLabel}>{item.label}</dt>
                <dd className={styles.closingPerkDetail}>{item.detail}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
