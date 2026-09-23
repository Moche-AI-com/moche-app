'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PLANS, type BillingInterval, type PlanId } from '@/lib/constants';
import s from './Pricing.module.css';

const PAID: PlanId[] = ['starter', 'pro', 'portfolio'];
const COPY = {
  free: { audience: 'Explore the experience', detail: 'Build a draft property and preview the guest journey.' },
  starter: { audience: 'For one live property', detail: 'Answer everyday guest questions with a property-trained AI.' },
  pro: { audience: 'For a growing team', detail: 'Give more properties a consistent guest experience.' },
  portfolio: { audience: 'For portfolio operators', detail: 'Coordinate guest support across your portfolio.' },
} as const;
const FREE_FEATURES = ['Guest portal and QR preview', 'Moche branding', 'No card required'];
const usd = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  maximumFractionDigits: 2,
}).format(amount);
const number = (amount: number) => amount.toLocaleString('en-US');

export function Pricing() {
  const [billing, setBilling] = useState<BillingInterval>('monthly');
  const yearly = billing === 'annual';
  const cards = [
    { id: 'free' as const, name: 'Free', monthly: 0, annual: 0, propertyLimit: 1,
      conversationAllowance: 30, smsAllowance: 0, features: FREE_FEATURES },
    ...PAID.map(id => PLANS[id]),
  ];
  return (
    <section id="pricing" aria-labelledby="pricing-title" className={s.section}>
      <div className={s.inner}>
        <header className={s.header}>
          <p className="eyebrow">Simple, predictable pricing</p>
          <h2 id="pricing-title">A plan for every hosting stage.</h2>
          <p className={s.lede}>Start free. Choose the right scale when you are ready to welcome guests.</p>
          <div className={s.billing} role="group" aria-label="Billing frequency">
            <button type="button" aria-pressed={!yearly} onClick={() => setBilling('monthly')}>Monthly</button>
            <button type="button" aria-pressed={yearly} onClick={() => setBilling('annual')}>
              Annual <span className={s.discount}>2 months free</span>
            </button>
          </div>
        </header>
        <div className={s.grid}>
          {cards.map((plan, index) => {
            const id = plan.id;
            const free = id === 'free';
            const featured = id === 'pro';
            const copy = COPY[id as keyof typeof COPY];
            const monthlyEquivalent = free ? 0 : yearly ? plan.annual / 12 : plan.monthly;
            const savings = free ? 0 : plan.monthly * 12 - plan.annual;
            const features = plan.features.filter(feature =>
              !/live propert|AI guest conversations each month|outbound SMS segments each month/i.test(feature));
            return (
              <article key={id} className={`${s.card} ${featured ? s.featured : ''}`} aria-labelledby={`pricing-${id}`}>
                <div className={s.signal} aria-hidden="true"><span /></div>
                <div className={s.cardTop}>
                  <span className={s.step}>0{index + 1} / 04</span>
                  {featured && <span className={s.popular}>Popular with growing hosts</span>}
                </div>
                <h3 id={`pricing-${id}`} className={s.planName}>{plan.name}</h3>
                <p className={s.audience}>{copy.audience}</p>
                <div className={s.price} aria-live="polite" aria-atomic="true">
                  <strong>{usd(monthlyEquivalent)}</strong><span>{free ? 'forever' : '/ month'}</span>
                </div>
                <p className={s.charge}>
                  {free ? 'No card required' : yearly
                    ? `${usd(plan.annual)} billed yearly · Save ${usd(savings)} a year`
                    : 'Billed monthly'}
                </p>
                <p className={s.detail}>{copy.detail}</p>
                <dl className={s.allowances}>
                  <div><dt>{free ? 'Draft property' : 'Live properties'}</dt><dd>{number(plan.propertyLimit)}</dd></div>
                  <div><dt>{free ? 'AI previews / month' : 'Pooled AI conversations / month'}</dt><dd>{number(plan.conversationAllowance)}</dd></div>
                  <div><dt>Outbound SMS segments / month</dt><dd>{free ? 'Not included' : number(plan.smsAllowance)}</dd></div>
                </dl>
                <ul className={s.features}>
                  {features.map(feature => <li key={feature}>{feature}</li>)}
                </ul>
                <Link href={free ? '/signup' : `/signup?plan=${id}&interval=${billing}`}
                  className={`btn ${featured ? 'btn-primary' : 'btn-ghost'} ${s.cta}`}>
                  {free ? 'Create free account' : `Create account for ${plan.name}`}
                  <span aria-hidden="true">↗</span>
                </Link>
              </article>
            );
          })}
        </div>
        <div className={s.scale}>
          <div><p className={s.scaleEyebrow}>MORE ROOM TO GROW</p><h3>Managing 16+ properties?</h3>
            <p>Scale starts at {usd(PLANS.enterprise.monthly)}/month. Allowances and terms are tailored to your operation.</p></div>
          <a className={`btn btn-ghost ${s.scaleLink}`} href="mailto:hostspark.org@gmail.com?subject=Moche-AI%20Scale%20plan%20inquiry">Talk to sales <span aria-hidden="true">↗</span></a>
        </div>
        <div className={s.notes}>
          <p>Prices in USD, before any applicable tax. No reservation percentage or per-property multiplier at checkout.</p>
          <p>At launch, usage overages are tracked but not automatically charged. Confirm a paid plan after creating your account; signing up alone does not start a subscription.</p>
          <p>Founding hosts: 50% off the first 12 months of billing after launch, locked at signup for the first 25 accounts.</p>
        </div>
      </div>
    </section>
  );
}
