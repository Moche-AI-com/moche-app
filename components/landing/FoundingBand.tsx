import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import dashboard from '@/public/premium/product-dashboard-desktop.png';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import {
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
} from '@/lib/constants';

// This section previously offered a card-required 30-day trial next to a mailto
// "apply as a founding host" link. Three problems, all now fixed:
//
//   1. It asked for a card directly below a Pricing section promising no card is
//      charged before launch. Whichever statement a visitor believed, one of them
//      cost us their trust.
//   2. The mailto was the only route into the programme and captured nothing. A
//      visitor who clicked it left the site and landed in a drafts folder.
//   3. A 30-day trial is meaningless next to a free plan with no time limit.
//
// The programme is now the signup itself: no application, no email, no card. The
// thing being offered is a rate that survives launch, which is worth something
// precisely because it is redeemed later. See docs/pricing-model-2027.md.
const PERKS = [
  `${FOUNDING_DISCOUNT_PERCENT}% off your first ${FOUNDING_DISCOUNT_MONTHS} months of billing, locked in when you sign up`,
  'A free plan you can publish on from day one — one property, live guest portal, no card on file',
  'Early access to new features before general release',
  'A direct line to the founder, not a ticket queue',
] as const;

// Stating the three steps is not decoration. The old section asked for a signup
// without saying what happened after it, and the honest answer (you build today,
// publish whenever you are ready) is more persuasive than the ask was.
const STEPS = [
  {
    title: 'Create your account',
    body: 'Email and a password. Nothing else, and no card.',
  },
  {
    title: 'Add your properties and build the Brain',
    body: 'Add each property once, then preview the guest portal exactly as a guest will see it.',
  },
  {
    title: 'Go live whenever you are ready',
    body: 'Publish your guest portal today — links and QR codes work immediately. Your founding rate is locked for your first paid plan.',
  },
] as const;

export function FoundingBand() {
  return (
    <section className={styles.founding} id="founding" aria-labelledby="founding-heading">
      <div className="wrap">
        <Reveal className={styles.foundingPanel}>
          <div className={styles.foundingCopy}>
            <span className={styles.eyebrow}>Founding Host Program</span>
            <h2 id="founding-heading" className={styles.foundingTitle}>
              Sign up now, pay half for your first year
            </h2>
            <p className="muted">
              Every account created before our official launch on January 1, 2027 is a founding
              account. There is no application and no waiting list. Sign up free, publish today,
              and the discount applies to the first paid plan you ever choose.
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
                  <span className={styles.foundingStepNum} aria-hidden>
                    {index + 1}
                  </span>
                  <span className={styles.foundingStepBody}>
                    <strong className={styles.foundingStepTitle}>{step.title}</strong>
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.foundingActions}>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Become a founding host
              </Link>
            </div>
            <p className={`muted ${styles.foundingTrial}`}>
              The founding rate is limited to the first {FOUNDING_ACCOUNT_CAP} accounts. After
              your {FOUNDING_DISCOUNT_MONTHS} discounted months you move to standard pricing,
              and you can cancel at any point before or after launch.{' '}
              <Link href="/founding-terms">Founding host terms</Link>.
            </p>
          </div>
          <div className={styles.foundingMedia}>
            {/* Real product capture (portfolio dashboard) rather than stock
                photography: the panel sells the programme, and the dashboard is
                the thing a founding host actually gets. */}
            <Image
              src={dashboard}
              alt="The Moche-AI host dashboard showing a live property portfolio, concierge activity, and guest-question insights"
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
