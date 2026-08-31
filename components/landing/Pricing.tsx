'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Reveal } from './Reveal';
import styles from './landing.module.css';
import {
  ANNUAL_MULTIPLIER,
  FOUNDING_ACCOUNT_CAP,
  FOUNDING_DISCOUNT_MONTHS,
  FOUNDING_DISCOUNT_PERCENT,
  GUIDED_SETUP_ADDITIONAL_USD,
  GUIDED_SETUP_USD,
  HOST_PRICING_BANDS,
  PLANS,
  SELF_SERVE_PROPERTY_MAX,
  effectiveRatePerProperty,
  monthlyTotalForProperties,
} from '@/lib/constants';

// This section had its own hardcoded copy of the plan grid, which is how the site
// came to advertise tiers and a setup fee that billing no longer charged. There is
// now exactly one source of truth: lib/constants.ts. The reasoning behind the
// numbers, including the competitor pricing they were set against, is in
// docs/pricing-model-2027.md.
//
// Pre-launch (go-live January 1, 2027) these cards exist for transparency rather
// than conversion. Nothing is billed before launch and no card is collected, so
// every CTA goes to signup, not to checkout.

const MIN_PROPERTIES = 1;
const DEFAULT_PROPERTIES = 3;
const MONTHS_PER_YEAR = 12;
const FREE_MONTHS_ON_ANNUAL = MONTHS_PER_YEAR - ANNUAL_MULTIPLIER;

// Half of an odd total is a half-dollar, and `toLocaleString()` renders that as
// "33.5", which reads as a truncated number rather than a price. Cents appear
// only when they exist, so whole amounts stay clean.
function usd(amount: number): string {
  return Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(2);
}

/** Human label for a band, e.g. "1st property", "2 to 4", "10 to 24". */
function bandLabel(index: number): string {
  const band = HOST_PRICING_BANDS[index];
  const from = index === 0 ? 1 : HOST_PRICING_BANDS[index - 1].upTo + 1;
  if (from === band.upTo) return from === 1 ? '1st property' : `Property ${from}`;
  return `Properties ${from} to ${band.upTo}`;
}

export function Pricing() {
  const [propertyCount, setPropertyCount] = useState(DEFAULT_PROPERTIES);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const sliderId = useId();

  const free = PLANS.starter;
  const host = PLANS.pro;

  const monthlyTotal = monthlyTotalForProperties(propertyCount);
  const displayTotal = billing === 'monthly' ? monthlyTotal : monthlyTotal * ANNUAL_MULTIPLIER;
  // Twelve months of the monthly rate, minus the ten months annual actually charges.
  // Stated as a dollar figure because "save 2 months" is a claim a host has to do
  // arithmetic to check, and the arithmetic is the whole offer.
  const annualSaving = monthlyTotal * (MONTHS_PER_YEAR - ANNUAL_MULTIPLIER);
  const perProperty = effectiveRatePerProperty(propertyCount);
  const foundingTotal = Math.round(displayTotal * (1 - FOUNDING_DISCOUNT_PERCENT / 100) * 100) / 100;
  const atCap = propertyCount >= SELF_SERVE_PROPERTY_MAX;

  return (
    <section className={styles.pricing} id="pricing" aria-labelledby="pricing-heading">
      <div className="wrap">
        <Reveal as="h2" id="pricing-heading" className={styles.sectionHeading}>
          Pricing that gets cheaper as you grow
        </Reveal>
        <Reveal as="p" delay={60} className={`muted ${styles.pricingIntro}`}>
          Moche-AI goes live January 1, 2027. Accounts created before then are free until
          launch and no card is collected. After launch you pay per property, and the rate
          drops as you add more. Guest messages are unlimited on every paid plan, with no
          per-conversation charge, because our costs sit in setup rather than in
          conversations.
        </Reveal>

        <Reveal delay={90} className={styles.pricingControls}>
          <div className={styles.pricingSlider}>
            <label htmlFor={sliderId} className={styles.pricingSliderLabel}>
              Properties
              <output htmlFor={sliderId} className={styles.pricingSliderValue}>
                {propertyCount}
              </output>
            </label>
            <input
              id={sliderId}
              type="range"
              min={MIN_PROPERTIES}
              max={SELF_SERVE_PROPERTY_MAX}
              step={1}
              value={propertyCount}
              onChange={(event) => setPropertyCount(Number(event.target.value))}
              className={styles.pricingRange}
            />
            <p className={styles.pricingSliderHint}>
              {atCap
                ? `Past ${SELF_SERVE_PROPERTY_MAX} properties, see Portfolio below.`
                : `Blended rate: $${perProperty.toFixed(2)} per property, per month.`}
            </p>
          </div>

          <div className={styles.pricingToggle} role="group" aria-label="Billing period">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              aria-pressed={billing === 'monthly'}
              className={styles.pricingToggleButton}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              aria-pressed={billing === 'annual'}
              className={styles.pricingToggleButton}
            >
              Annual
              <span className={styles.pricingToggleNote}>
                {FREE_MONTHS_ON_ANNUAL} months free
              </span>
            </button>
          </div>
        </Reveal>

        <div className={styles.pricingTrack}>
          <Reveal className={styles.pricingPanel}>
            <div className={styles.pricingRail}>
              <h3 className={styles.pricingTier}>{free.name}</h3>
              <p className={styles.pricingPrice}>
                <span className={styles.pricingAmount}>$0</span>
                <span className={styles.pricingPer}>forever</span>
              </p>
              <p className={styles.pricingProperties}>One property, no card, no time limit</p>
            </div>
            <div className={styles.pricingDetail}>
              <ul className={styles.pricingFacts}>
                {free.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link href="/signup" className={`btn btn-ghost btn-block ${styles.pricingCta}`}>
                Start free
              </Link>
            </div>
          </Reveal>

          <Reveal delay={55} className={styles.pricingPanel} data-featured="">
            <span className={styles.pricingFlag} data-visible="">
              Most hosts
            </span>
            <div className={styles.pricingRail}>
              <h3 className={styles.pricingTier}>{host.name}</h3>
              <p className={styles.pricingPrice}>
                <span className={styles.pricingAmount}>${usd(displayTotal)}</span>
                <span className={styles.pricingPer}>
                  {billing === 'monthly' ? '/mo' : '/yr'}
                </span>
              </p>
              <p className={styles.pricingProperties}>
                {propertyCount === 1
                  ? 'For 1 property'
                  : `For ${propertyCount} properties, $${perProperty.toFixed(2)} each`}
              </p>
              {billing === 'annual' ? (
                <p className={styles.pricingSaving}>
                  Pay annually, get {FREE_MONTHS_ON_ANNUAL} months free. That is{' '}
                  <strong>${usd(annualSaving)}</strong> less than ${usd(monthlyTotal)} a month
                  for {MONTHS_PER_YEAR} months.
                </p>
              ) : null}
              <p className={styles.pricingFounding}>
                Founding hosts lock{' '}
                <strong>
                  ${usd(foundingTotal)}
                  {billing === 'monthly' ? '/mo' : '/yr'}
                </strong>{' '}
                for the first {FOUNDING_DISCOUNT_MONTHS} months.
              </p>
            </div>
            <div className={styles.pricingDetail}>
              <ul className={styles.pricingFacts}>
                {host.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link href="/signup" className={`btn btn-primary btn-block ${styles.pricingCta}`}>
                Become a founding host
              </Link>
            </div>
          </Reveal>
        </div>

        {/* The bands are published rather than summarised. A host who is about to add
            their fifth property should be able to see what it costs before they do it,
            not discover it on an invoice. */}
        <Reveal delay={110} className={styles.pricingBands}>
          <h3 className={styles.pricingBandsTitle}>How the rate steps down</h3>
          <ul className={styles.pricingBandList}>
            {HOST_PRICING_BANDS.map((band, index) => (
              <li key={band.upTo} className={styles.pricingBandItem}>
                <span className={styles.pricingBandRange}>{bandLabel(index)}</span>
                <span className={styles.pricingBandRate}>${band.ratePerProperty}</span>
                <span className={styles.pricingBandUnit}>per property, per month</span>
              </li>
            ))}
          </ul>
          <p className={styles.pricingBandNote}>
            Each band prices only the properties inside it, so adding a property never
            raises what you already pay. At {SELF_SERVE_PROPERTY_MAX} properties the blended
            rate is ${effectiveRatePerProperty(SELF_SERVE_PROPERTY_MAX).toFixed(2)}.
          </p>
        </Reveal>

        <Reveal delay={140} className={styles.pricingVolume}>
          <p className={styles.pricingVolumeCopy}>
            <strong>{SELF_SERVE_PROPERTY_MAX + 1} or more properties?</strong>{' '}
            {PLANS.portfolio.name} adds roles, bulk tools and PMS integrations at volume
            rates below ${HOST_PRICING_BANDS[HOST_PRICING_BANDS.length - 1].ratePerProperty}
            /property/mo, set by contract. Need SSO, an SLA, API access or white label?{' '}
            {PLANS.enterprise.name} is custom.
          </p>
          <Link href="/support" className={styles.pricingVolumeLink}>
            Talk to us
          </Link>
        </Reveal>

        <Reveal delay={170} className={styles.pricingSetup}>
          <p className={styles.pricingSetupCopy}>
            <strong>Setup is self serve and included.</strong> If you would rather hand it
            over, Concierge Setup is ${GUIDED_SETUP_USD} for your first property and $
            {GUIDED_SETUP_ADDITIONAL_USD} for each one after that, once per account. It is
            optional, and it is not required to go live.
          </p>
        </Reveal>

        <p className={styles.pricingCapNote}>
          The founding rate is limited to the first {FOUNDING_ACCOUNT_CAP} accounts.
        </p>
      </div>
    </section>
  );
}
