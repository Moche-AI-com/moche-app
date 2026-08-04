import styles from './landing.module.css';

const BENEFITS = [
  {
    title: 'Save hours every week',
    detail: 'Answer routine guest questions automatically so your team can focus on the stays that need a human.',
  },
  {
    title: 'Increase feedback and reviews',
    detail: 'Nudge guests toward leaving a review at the right moment in their stay, every time.',
  },
  {
    title: 'Answer guest questions instantly',
    detail: 'Guests get accurate answers about check-in, Wi-Fi, and house rules the moment they ask, day or night.',
  },
  {
    title: 'Never lose property knowledge again',
    detail: 'Every detail about a property lives in one place instead of scattered notes, texts, and memory.',
  },
] as const;

export function Benefits() {
  return (
    <section className={styles.benefitsSection} aria-labelledby="benefits-heading">
      <div className="wrap">
        <h2 id="benefits-heading" className={styles.sectionHeading}>
          Built for the way hosts actually work
        </h2>
        <div className={styles.benefitsSectionGrid}>
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className={`card ${styles.benefitsSectionCard}`}>
              <h3 className={styles.benefitsSectionTitle}>{benefit.title}</h3>
              <p className="muted">{benefit.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
