import Link from 'next/link';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import {
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
} from '@/lib/constants';

const MAILTO = 'mailto:hostspark.org@gmail.com';

const DEMO_MAILTO = `${MAILTO}?subject=${encodeURIComponent(
  'Beta access — request a demo',
)}&body=${encodeURIComponent(
  "Hi Moche-AI team,\n\nI'd like a demo before I start. Here's a bit about my properties:\n\n",
)}`;

const SALES_MAILTO = `${MAILTO}?subject=${encodeURIComponent(
  'Beta access — talk to sales',
)}&body=${encodeURIComponent(
  "Hi Moche-AI team,\n\nI'd like to talk through a plan for my portfolio. Here's how it's structured:\n\n",
)}`;

// Closing CTA. Sits after the FAQ, which is where a visitor who read the whole
// page ends up with nothing left to click -- the previous last thing on the
// page was a question about cancellation.
//
// It does not repeat the founding band's job. That section mid-page argues for
// the programme; this one only makes the three ways in impossible to miss, and
// states the beta incentive plainly next to them.
//
// Every incentive below is already promised elsewhere on the page (the hero
// pre-launch note and the founding band's perk list). Nothing new is offered,
// and the numbers come from constants so this can never drift from the offer
// the checkout actually applies.
const INCENTIVES = [
  {
    label: `${FOUNDING_DISCOUNT_PERCENT}% off for ${FOUNDING_DISCOUNT_MONTHS} months`,
    detail: `Locked in at signup for the first ${FOUNDING_ACCOUNT_CAP} accounts. No card until launch, and you can cancel at any point.`,
  },
  {
    label: 'Prioritized setup',
    detail: 'We load your first property with you, so the brain is answering before your next stay.',
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
          <Reveal as="span" className={styles.eyebrow}>
            Beta access &amp; founding members
          </Reveal>
          <Reveal as="h2" id="closing-heading" className={styles.closingTitle}>
            Elevate your stay, get more reviews, and handle fewer questions.
          </Reveal>
          <Reveal as="p" delay={70} className={styles.closingLead}>
            Start free today, or have us walk you through it first. Either way you are set up before
            your next check-in.
          </Reveal>

          <Reveal delay={140} className={styles.closingActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start free today
            </Link>
            <a href={DEMO_MAILTO} className="btn btn-ghost btn-lg">
              Request a demo
            </a>
            <a href={SALES_MAILTO} className={styles.closingTextLink}>
              Contact sales
            </a>
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
