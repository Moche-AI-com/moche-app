import Link from 'next/link';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import { useState } from 'react';

const PLANS = [
  {
    name: 'Essentials',
    slug: 'essentials',
    pricePerProperty: 29,
    features: [
      'Property Brain & guest portal',
      'Grounded AI Q&A (verified facts)',
      'Structured requests & escalation',
      'Host‑approved memory updates',
    ],
    popular: false,
  },
  {
    name: 'Pro',
    slug: 'pro',
    pricePerProperty: 49,
    features: [
      'Everything in Essentials',
      'Learning analytics & insights',
      'Workflow automation & branding',
      'Multi‑property dashboards',
    ],
    popular: true,
  },
] as const;

const ANNUAL_MULTIPLIER = 10; // 10 months = 2 free
const MIN_PROPERTIES = 1;
const MAX_PROPERTIES = 9; // beyond this, Portfolio/Enterprise

const CONTACT_SALES_MAILTO = `mailto:hostspark.org@gmail.com?subject=${encodeURIComponent(
  'Portfolio or Enterprise pricing',
)}&body=${encodeURIComponent(
  'Hi Moche-AI team,\n\nWe manage 10+ properties and would like to discuss Portfolio/Enterprise pricing.\n\n'
)}`;

export function Pricing() {
  const [propertyCount, setPropertyCount] = useState(5);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  const totalMonthly = (planPrice: number) => propertyCount * planPrice;
  const totalAnnual = (planPrice: number) => totalMonthly(planPrice) * ANNUAL_MULTIPLIER;

  return (
    <section className={styles.pricing} id="pricing" aria-labelledby="pricing-heading">
      <div className="wrap">
        <Reveal as="h2" id="pricing-heading" className={styles.sectionHeading}>
          Pricing that scales with your portfolio
        </Reveal>
        <Reveal as="p" delay={60} className={`muted ${styles.pricingIntro}`}>
          Simple per‑property pricing. Pay annually for {ANNUAL_MULTIPLIER}x the monthly rate
          (that’s two months free). No per‑conversation fees — unlimited guests and stays.
          <br />
          <strong>One‑time setup:</strong> $149/property for guided onboarding, or use
          self‑service at no cost.
        </Reveal>

        {/* Property count slider + billing toggle */}
        <div className={styles.pricingControls}>
          <div className={styles.pricingSliderGroup}>
            <label htmlFor="propertyCount" className={styles.pricingSliderLabel}>
              Properties: <span>{propertyCount}</span>
            </label>
            <input
              id="propertyCount"
              type="range"
              min={MIN_PROPERTIES}
              max={MAX_PROPERTIES}
              step={1}
              value={propertyCount}
              onChange={(e) => setPropertyCount(Number(e.target.value))}
              className={styles.pricingSlider}
            />
            <span className={styles.pricingSliderHint}>
              {propertyCount >= 10 ? 'Contact us for Portfolio discounts' : ''}
            </span>
          </div>

          <div className={styles.pricingBillingToggle}>
            <button
              className={`${styles.billingBtn} ${billing === 'monthly' ? styles.active : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              className={`${styles.billingBtn} ${billing === 'annual' ? styles.active : ''}`}
              onClick={() => setBilling('annual')}
            >
              Annual <span className={styles.billingSavings}>(save 2 mo)</span>
            </button>
          </div>
        </div>

        <div className={styles.pricingTrack}>
          {PLANS.map((plan, i) => {
            const monthlyTotal = totalMonthly(plan.pricePerProperty);
            const annualTotal = totalAnnual(plan.pricePerProperty);
            const displayPrice = billing === 'monthly' ? monthlyTotal : annualTotal;
            const priceLabel = billing === 'monthly' ? '/mo' : '/yr';

            return (
              <Reveal
                key={plan.slug}
                delay={i * 55}
                className={styles.pricingPanel}
                dataAttrs={{ 'data-featured': plan.popular ? '' : undefined }}
              >
                <div className={styles.pricingRail}>
                  <span className={styles.pricingFlag} data-visible={plan.popular ? '' : undefined}>
                    Most chosen
                  </span>
                  <h3 className={styles.pricingTier}>{plan.name}</h3>
                  <p className={styles.pricingPrice}>
                    <span className={styles.pricingAmount}>${displayPrice}</span>
                    <span className={styles.pricingPer}>{priceLabel}</span>
                  </p>
                  <p className={styles.pricingProperties}>
                    ${plan.pricePerProperty}/property/mo
                  </p>
                </div>

                <div className={styles.pricingDetail}>
                  <div className={styles.pricingDetailInner}>
                    <ul className={styles.pricingFacts}>
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                      <li>Unlimited guests and stays</li>
                      <li>No per‑conversation charges</li>
                    </ul>
                    <Link
                      href="/signup"
                      className={`btn ${plan.popular ? 'btn-primary' : 'btn-ghost'} btn-block ${styles.pricingCta}`}
                    >
                      Start free trial
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={PLANS.length * 55} className={styles.pricingVolume}>
          <p className={styles.pricingVolumeCopy}>
            <strong>10+ properties?</strong> Get our Portfolio plan with roles, bulk tools,
            and deeper integrations at discounted per‑property rates ($25–39/property/mo).
            For 41+ properties, we offer custom Enterprise pricing.
          </p>
          <a href={CONTACT_SALES_MAILTO} className={styles.pricingVolumeLink}>
            Contact sales
          </a>
        </Reveal>
      </div>
    </section>
  );
}
