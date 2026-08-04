import styles from './landing.module.css';

const TIERS = [
  { name: 'Starter', properties: '1 property', monthly: 29, conversations: 50 },
  { name: 'Pro', properties: '2-5 properties', monthly: 69, conversations: 200 },
  { name: 'Growth', properties: '6-10 properties', monthly: 119, conversations: 500 },
  { name: 'Scale', properties: '11-15 properties', monthly: 169, conversations: 800 },
  { name: 'Portfolio', properties: '16-40 properties', monthly: 249, conversations: 1500 },
] as const;

const ANNUAL_MULTIPLIER = 10;
const CONTACT_SALES_MAILTO = `mailto:hostspark.org@gmail.com?subject=${encodeURIComponent(
  'Contact sales -- 41+ properties',
)}&body=${encodeURIComponent('Hi Moche-AI team,\n\nWe manage 41+ properties and would like to talk pricing.\n\n')}`;

// Exact tiers and multiplier per the task spec -- do not invent other numbers.
export function Pricing() {
  return (
    <section className={styles.pricingSection} id="pricing" aria-labelledby="pricing-heading">
      <div className="wrap">
        <h2 id="pricing-heading" className={styles.sectionHeading}>
          Pricing that scales with your portfolio
        </h2>
        <p className={`muted ${styles.pricingSectionIntro}`}>
          Monthly plans shown below. Pay annually for {ANNUAL_MULTIPLIER}x the monthly rate
          (two months free). Overage beyond your plan&apos;s conversation allotment is billed at
          $0.02 per conversation.
        </p>
        <div className={styles.pricingSectionGrid}>
          {TIERS.map((tier) => (
            <div key={tier.name} className={`card ${styles.pricingSectionCard}`}>
              <h3 className={styles.pricingSectionTier}>{tier.name}</h3>
              <p className={`muted ${styles.pricingSectionProperties}`}>{tier.properties}</p>
              <p className={styles.pricingSectionPrice}>
                <span className={styles.pricingSectionAmount}>${tier.monthly}</span>
                <span className="muted">/mo</span>
              </p>
              <p className={`muted ${styles.pricingSectionConversations}`}>
                {tier.conversations.toLocaleString()} conversations/mo
              </p>
              <p className={`muted ${styles.pricingSectionAnnual}`}>
                or ${tier.monthly * ANNUAL_MULTIPLIER}/yr
              </p>
            </div>
          ))}
          <div className={`card ${styles.pricingSectionCard} ${styles.pricingSectionCardContact}`}>
            <h3 className={styles.pricingSectionTier}>41+ properties</h3>
            <p className={`muted ${styles.pricingSectionProperties}`}>Custom volume pricing</p>
            <a href={CONTACT_SALES_MAILTO} className="btn btn-primary btn-block">
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
