import Link from 'next/link';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

const TIERS = [
  { name: 'Starter', properties: '1 property', monthly: 29, conversations: 50, popular: false },
  { name: 'Pro', properties: '2-5 properties', monthly: 69, conversations: 200, popular: true },
  { name: 'Growth', properties: '6-10 properties', monthly: 119, conversations: 500, popular: false },
  { name: 'Scale', properties: '11-15 properties', monthly: 169, conversations: 800, popular: false },
  { name: 'Portfolio', properties: '16-40 properties', monthly: 249, conversations: 1500, popular: false },
] as const;

const ANNUAL_MULTIPLIER = 10;
const CONTACT_SALES_MAILTO = `mailto:hostspark.org@gmail.com?subject=${encodeURIComponent(
  'Contact sales -- 41+ properties',
)}&body=${encodeURIComponent('Hi Moche-AI team,\n\nWe manage 41+ properties and would like to talk pricing.\n\n')}`;

// Exact tiers and multiplier per the approved pricing spec -- do not invent
// other numbers. Every card ends in an action: a tier the visitor can start on
// their own, or a way to reach a human for the volume tier.
export function Pricing() {
  return (
    <section className={styles.pricing} id="pricing" aria-labelledby="pricing-heading">
      <div className="wrap">
        <Reveal as="h2" id="pricing-heading" className={styles.sectionHeading}>
          Pricing that scales with your portfolio
        </Reveal>
        <Reveal as="p" delay={60} className={`muted ${styles.pricingIntro}`}>
          Every plan starts with a free month on the top tier, up to 5 properties. Pay annually for{' '}
          {ANNUAL_MULTIPLIER}x the monthly rate, which works out to two months free. Conversations
          beyond your allotment are billed at $0.02 each, and we throttle rather than cut you off.
        </Reveal>

        <div className={styles.pricingGrid}>
          {TIERS.map((tier, i) => (
            <Reveal
              key={tier.name}
              delay={i * 55}
              className={`${styles.pricingCard} ${tier.popular ? styles.pricingCardPopular : ''}`}
            >
              {tier.popular ? <span className={styles.pricingFlag}>Most chosen</span> : null}
              <h3 className={styles.pricingTier}>{tier.name}</h3>
              <p className={`muted ${styles.pricingProperties}`}>{tier.properties}</p>
              <p className={styles.pricingPrice}>
                <span className={styles.pricingAmount}>${tier.monthly}</span>
                <span className="muted">/mo</span>
              </p>
              <p className={`muted ${styles.pricingConversations}`}>
                {tier.conversations.toLocaleString()} conversations/mo
              </p>
              <p className={`muted ${styles.pricingAnnual}`}>
                or ${tier.monthly * ANNUAL_MULTIPLIER}/yr
              </p>
              <Link
                href="/signup"
                className={`btn ${tier.popular ? 'btn-primary' : 'btn-ghost'} btn-block ${styles.pricingCta}`}
              >
                Start free trial
              </Link>
            </Reveal>
          ))}

          <Reveal delay={TIERS.length * 55} className={`${styles.pricingCard} ${styles.pricingCardContact}`}>
            <h3 className={styles.pricingTier}>41+ properties</h3>
            <p className={`muted ${styles.pricingProperties}`}>Custom volume pricing</p>
            <p className={`muted ${styles.pricingContactDetail}`}>
              Tell us how your portfolio is structured and we will put a plan together.
            </p>
            <a href={CONTACT_SALES_MAILTO} className={`btn btn-ghost btn-block ${styles.pricingCta}`}>
              Contact sales
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
