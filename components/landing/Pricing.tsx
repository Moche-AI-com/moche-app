'use client';
import Link from 'next/link';
import { useState, type CSSProperties, type PointerEvent } from 'react';
import { PLANS, type BillingInterval, type PlanId } from '@/lib/constants';
import s from './Pricing.module.css';

type Tier = 'free' | PlanId;
type Card = {
  id: Tier;
  name: string;
  monthly: number;
  annual: number;
  propertyLimit: number;
  conversationAllowance: number;
  smsAllowance: number;
  features: string[];
};

const PAID: PlanId[] = ['starter', 'pro', 'portfolio'];
const FEATURED: Tier = 'pro';

const META: Record<string, { tagline: string; fit: string }> = {
  free: { tagline: 'Try it out', fit: 'Build your Property Brain and preview the guest portal.' },
  starter: { tagline: 'One live rental', fit: 'Put one property in front of real guests.' },
  pro: { tagline: 'Growing hosts', fit: 'Run up to 5 properties with co-hosts and analytics.' },
  portfolio: { tagline: 'Small portfolios', fit: 'Manage up to 15 properties with roles and reporting.' },
};

const MAX = { props: 15, conv: 4000, sms: 1000 };

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const meter = (v: number, max: number) => (v <= 0 ? 0 : Math.max(6, Math.round(Math.sqrt(v / max) * 100)));

function TierArt({ tier }: { tier: Tier }) {
  const g = `pricing-grad-${tier}`;
  return (
    <svg className={s.art} viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--teal)" />
          <stop offset="100%" stopColor={tier === FEATURED ? 'var(--coral)' : 'var(--iris)'} />
        </linearGradient>
      </defs>
      <circle className={s.halo} cx="60" cy="34" r="26" fill={`url(#${g})`} />
      {tier === 'free' && (
        <g stroke={`url(#${g})`} fill="none" strokeWidth="2.5" strokeLinejoin="round">
          <path className={s.draw} d="M44 50V32l16-12 16 12v18z" />
          <circle className={s.blink} cx="60" cy="38" r="3" fill={`url(#${g})`} stroke="none" />
        </g>
      )}
      {tier === 'starter' && (
        <g stroke={`url(#${g})`} fill="none" strokeWidth="2.5" strokeLinejoin="round">
          <path className={s.draw} d="M36 52V34l14-11 14 11v18z" />
          <g className={s.bubble}>
            <rect x="68" y="12" width="30" height="18" rx="7" />
            <circle className={s.dot1} cx="77" cy="21" r="1.8" fill={`url(#${g})`} stroke="none" />
            <circle className={s.dot2} cx="83" cy="21" r="1.8" fill={`url(#${g})`} stroke="none" />
            <circle className={s.dot3} cx="89" cy="21" r="1.8" fill={`url(#${g})`} stroke="none" />
          </g>
        </g>
      )}
      {tier === 'pro' && (
        <g stroke={`url(#${g})`} fill="none" strokeWidth="2.5" strokeLinejoin="round">
          <path className={s.rise} style={{ '--d': '0ms' } as CSSProperties} d="M26 54V40l10-8 10 8v14z" />
          <path className={s.rise} style={{ '--d': '120ms' } as CSSProperties} d="M48 54V32l12-9 12 9v22z" />
          <path className={s.rise} style={{ '--d': '240ms' } as CSSProperties} d="M74 54V40l10-8 10 8v14z" />
          <g className={s.orbit}>
            <circle cx="60" cy="8" r="3" fill="var(--coral)" stroke="none" />
          </g>
        </g>
      )}
      {tier === 'portfolio' && (
        <g stroke={`url(#${g})`} fill="none" strokeWidth="2.2" strokeLinejoin="round">
          {[18, 34, 50, 66, 82].map((x, i) => (
            <rect
              key={x}
              className={s.rise}
              style={{ '--d': `${i * 90}ms` } as CSSProperties}
              x={x}
              y={54 - [16, 26, 34, 22, 28][i]}
              width="12"
              height={[16, 26, 34, 22, 28][i]}
              rx="2"
            />
          ))}
          <path className={s.draw} d="M14 56h92" />
          <g className={s.orbit}>
            <circle cx="60" cy="8" r="2.5" fill="var(--teal)" stroke="none" />
          </g>
        </g>
      )}
    </svg>
  );
}

function onMove(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
  el.style.setProperty('--rx', `${(0.5 - y) * 5}deg`);
  el.style.setProperty('--ry', `${(x - 0.5) * 5}deg`);
}

function onLeave(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
}

export function Pricing() {
  const [billing, setBilling] = useState<BillingInterval>('monthly');
  const annual = billing === 'annual';

  const cards: Card[] = [
    {
      id: 'free',
      name: 'Free',
      monthly: 0,
      annual: 0,
      propertyLimit: 1,
      conversationAllowance: 30,
      smsAllowance: 0,
      features: ['Guest portal and QR preview', 'Moche branding', 'No card required'],
    },
    ...PAID.map((id): Card => {
      const p = PLANS[id];
      return {
        id,
        name: p.name,
        monthly: p.monthly,
        annual: p.annual,
        propertyLimit: p.propertyLimit,
        conversationAllowance: p.conversationAllowance,
        smsAllowance: p.smsAllowance,
        features: [...p.features].filter((f) => !/each month|live propert|draft propert/i.test(f)),
      };
    }),
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className={s.section}>
      <div className={s.inner}>
        <header className={s.head}>
          <p className="eyebrow">Simple, predictable pricing</p>
          <h2 id="pricing-title" className={s.title}>
            Start free. Upgrade when guests start asking.
          </h2>
          <p className={s.sub}>
            One flat monthly price per plan. No booking fees, no per-property surcharges.
          </p>

          <div className={s.toggle} role="group" aria-label="Billing interval" data-annual={annual || undefined}>
            <span className={s.thumb} aria-hidden="true" />
            <button type="button" aria-pressed={!annual} onClick={() => setBilling('monthly')}>
              Monthly
            </button>
            <button type="button" aria-pressed={annual} onClick={() => setBilling('annual')}>
              Annual <span className={s.save}>2 months free</span>
            </button>
          </div>

          <p className={s.founding}>
            <span className={s.spark} aria-hidden="true" />
            Founding hosts get <strong>50% off</strong> their first 12 months on any paid plan &middot; first 25 accounts
          </p>
        </header>

        <div className={s.grid}>
          {cards.map((plan, i) => {
            const featured = plan.id === FEATURED;
            const free = plan.id === 'free';
            const perMonth = annual ? plan.annual / 12 : plan.monthly;
            const meta = META[plan.id] ?? { tagline: '', fit: '' };
            const prev = i > 1 ? cards[i - 1].name : null;
            return (
              <article
                key={plan.id}
                className={`${s.card} ${featured ? s.featured : ''}`}
                style={{ '--i': i } as CSSProperties}
                onPointerMove={onMove}
                onPointerLeave={onLeave}
                aria-labelledby={`plan-${plan.id}`}
              >
                <span className={s.glow} aria-hidden="true" />
                {featured ? <span className={s.badge}>Most popular</span> : null}

                <TierArt tier={plan.id} />

                <div className={s.nameRow}>
                  <h3 id={`plan-${plan.id}`} className={s.name}>
                    {plan.name}
                  </h3>
                  <span className={s.tagline}>{meta.tagline}</span>
                </div>

                <div className={s.priceRow}>
                  <span key={billing} className={s.price}>
                    {usd(perMonth)}
                  </span>
                  <span className={s.per}>{free ? 'forever' : '/mo'}</span>
                </div>
                <p className={s.billed}>
                  {free ? 'No card required' : annual ? `${usd(plan.annual)} billed yearly` : 'Billed monthly, cancel anytime'}
                </p>

                <p className={s.fit}>{meta.fit}</p>

                <dl className={s.meters}>
                  {[
                    { label: free ? 'Draft property' : plan.propertyLimit === 1 ? 'Live property' : 'Live properties', v: plan.propertyLimit, max: MAX.props },
                    { label: free ? 'AI previews / mo' : 'AI conversations / mo', v: plan.conversationAllowance, max: MAX.conv },
                    { label: 'SMS / mo', v: plan.smsAllowance, max: MAX.sms },
                  ].map((m) => (
                    <div key={m.label} className={s.meter}>
                      <dt>{m.label}</dt>
                      <dd>
                        <strong>{m.v === 0 ? '—' : m.v.toLocaleString()}</strong>
                        <span className={s.bar} aria-hidden="true">
                          <span style={{ '--w': `${meter(m.v, m.max)}%` } as CSSProperties} />
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className={s.features}>
                  {prev ? <li className={s.plus}>Everything in {prev}, plus:</li> : null}
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>

                <Link
                  href={free ? '/signup' : `/signup?plan=${plan.id}&interval=${billing}`}
                  className={`btn ${featured ? 'btn-primary' : 'btn-ghost'} btn-block ${s.cta}`}
                >
                  {free ? 'Start free' : `Choose ${plan.name}`}
                  <span className={s.arrow} aria-hidden="true">&rarr;</span>
                </Link>
              </article>
            );
          })}
        </div>

        <ul className={s.fine}>
          <li>Prices in USD, before sales tax.</li>
          <li>Going over your allowance? We track it but never auto-charge during launch.</li>
          <li>More than 15 properties? Scale plans start at $199/month.</li>
        </ul>
      </div>
    </section>
  );
}
