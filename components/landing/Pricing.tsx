'use client';
import Link from 'next/link';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import { useState } from 'react';

// Per-property self-serve tiers, per the August 2026 pitch deck. The billed grid
// lives in lib/constants.ts (PLANS); this marketing copy mirrors it by design —
// the deck's Portfolio ($25-39/property/mo, 10+) and Enterprise (custom) tiers are
// contract-priced and therefore appear here as the contact-sales note below, not
// as cards with invented numbers.
const PLANS = [
  {
    name: 'Essentials',
    slug: 'essentials',
    pricePerProperty: 29,
    features: [
      'Property Brain & guest portal',
      'Grounded AI Q&A (verified facts)',
      'Structured requests & escalation',
      'Host-approved memory updates',
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
      'Multi-property dashboards',
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
          Every plan starts with a free month on the top tier, up to 5 properties. Simple
          per-property pricing after that: pay annually for {ANNUAL_MULTIPLIER}x the monthly
          rate (that&rsquo;s two months free). No per-conversation fees &mdash; unlimited guests
          and stays.
          <br />
          <strong>One-time setup:</strong> $149/property for guided onboarding, or use
          self-service at no cost.
        </Reveal>

        {/* Property count slider + billing toggle. Styled inline: the CSS-module classes
            an earlier iteration referenced were never added to landing.module.css, so the
            controls rendered unstyled. These styles are self-contained on purpose. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            margin: '1.5rem 0 2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.9rem', flexWrap: 'wrap' }}>
            <label htmlFor="propertyCount" style={{ fontSize: '.9rem', fontWeight: 600 }}>
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
              aria-label="Number of properties"
              style={{ width: 180, accentColor: 'var(--teal, #0FA79A)' }}
            />
            <span className="faint" style={{ fontSize: '.78rem' }}>
              {propertyCount >= MAX_PROPERTIES ? 'Managing 10 or more? See Portfolio below.' : 'Per property, per month'}
            </span>
          </div>

          <div
            role="group"
            aria-label="Billing period"
            style={{
              display: 'inline-flex',
              gap: '.25rem',
              padding: '.25rem',
              borderRadius: 999,
              border: '1px solid var(--border, rgba(20,50,90,.12))',
              background: 'var(--surface, #fff)',
            }}
          >
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              aria-pressed={billing === 'monthly'}
              style={{
                minHeight: 44,
                padding: '0 1.1rem',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '.88rem',
                background: billing === 'monthly' ? 'var(--teal, #0FA79A)' : 'transparent',
                color: billing === 'monthly' ? '#04121a' : 'inherit',
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              aria-pressed={billing === 'annual'}
              style={{
                minHeight: 44,
                padding: '0 1.1rem',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '.88rem',
                background: billing === 'annual' ? 'var(--teal, #0FA79A)' : 'transparent',
                color: billing === 'annual' ? '#04121a' : 'inherit',
              }}
            >
              Annual <span style={{ fontWeight: 500, opacity: .8 }}>(save 2 mo)</span>
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
                      <li>No per-conversation charges</li>
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
            <strong>10+ properties?</strong> Portfolio adds roles, bulk tools, and PMS
            integrations at volume rates ($25&ndash;39/property/mo, set by contract). Need SSO,
            an SLA, API access, or white label? Enterprise is custom.
          </p>
          <a href={CONTACT_SALES_MAILTO} className={styles.pricingVolumeLink}>
            Contact sales
          </a>
        </Reveal>
      </div>
    </section>
  );
}
