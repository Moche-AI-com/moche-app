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
// other numbers. Every panel ends in an action: a tier the visitor can start on
// their own, or a way to reach a human for the volume tier.
//
// Six equal cards made the row read as a wall of numbers with no route through
// it. On a fine-pointer desktop the tiers are now one expanding rail: the
// recommended tier is open by default, and pointing at any other tier opens
// that one and lets the rest recede. The rail (name, price, property count) is
// always legible in every panel, so nothing a visitor needs to compare is
// hidden behind an interaction -- only the supporting detail and the CTA move.
//
// Everything narrower than 1000px, and any coarse-pointer device at any width,
// gets the plain stacked grid instead. See landing.module.css.
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

        <div className={styles.pricingTrack}>
          {TIERS.map((tier, i) => (
            <Reveal
              key={tier.name}
              delay={i * 55}
              className={styles.pricingPanel}
              dataAttrs={{ 'data-featured': tier.popular ? '' : undefined }}
            >
              <div className={styles.pricingRail}>
                <span className={styles.pricingFlag} data-visible={tier.popular ? '' : undefined}>
                  Most chosen
                </span>
                <h3 className={styles.pricingTier}>{tier.name}</h3>
                <p className={styles.pricingPrice}>
                  <span className={styles.pricingAmount}>${tier.monthly}</span>
                  <span className={styles.pricingPer}>/mo</span>
                </p>
                <p className={styles.pricingProperties}>{tier.properties}</p>
              </div>

              <div className={styles.pricingDetail}>
                <div className={styles.pricingDetailInner}>
                  <ul className={styles.pricingFacts}>
                    <li>{tier.conversations.toLocaleString()} conversations a month</li>
                    <li>${tier.monthly * ANNUAL_MULTIPLIER} a year, billed annually</li>
                    <li>Unlimited guests and stays</li>
                  </ul>
                  <Link
                    href="/signup"
                    className={`btn ${tier.popular ? 'btn-primary' : 'btn-ghost'} btn-block ${styles.pricingCta}`}
                  >
                    Start free trial
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}

        </div>

        <Reveal delay={TIERS.length * 55} className={styles.pricingVolume}>
          <p className={styles.pricingVolumeCopy}>
            <strong>41 properties or more?</strong> Volume pricing is built around how your
            portfolio is structured.
          </p>
          <a href={CONTACT_SALES_MAILTO} className={styles.pricingVolumeLink}>
            Contact sales
          </a>
        </Reveal>
      </div>
    </section>
  );
}
