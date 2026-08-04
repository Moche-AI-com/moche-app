import { Clock, Star, MessageSquare, Brain } from 'lucide-react';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Outcome-led, per the product language rules: each title is a result the host
// gets, not a feature the software has.
const BENEFITS = [
  {
    Icon: Clock,
    title: 'Save hours every week',
    detail:
      'Routine guest questions get answered for you, so your team only steps in for the stays that actually need a person.',
  },
  {
    Icon: Star,
    title: 'Increase feedback and reviews',
    detail:
      'Guests get nudged toward leaving a review at the right moment in their stay, on every single booking.',
  },
  {
    Icon: MessageSquare,
    title: 'Answer guest questions instantly',
    detail:
      'Check-in, Wi-Fi, parking, house rules. Accurate answers arrive the moment a guest asks, day or night.',
  },
  {
    Icon: Brain,
    title: 'Never lose property knowledge again',
    detail:
      'Every detail about every property lives in one place instead of scattered notes, old texts, and memory.',
  },
] as const;

export function Benefits() {
  return (
    <section className={styles.benefits} aria-labelledby="benefits-heading">
      <div className="wrap">
        <Reveal as="h2" id="benefits-heading" className={styles.sectionHeading}>
          Built for the way hosts actually work
        </Reveal>
        <div className={styles.benefitsGrid}>
          {BENEFITS.map(({ Icon, title, detail }, i) => (
            <Reveal key={title} delay={i * 70} className={styles.benefitsCard}>
              <span className={styles.benefitsIcon} aria-hidden>
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <h3 className={styles.benefitsTitle}>{title}</h3>
              <p className="muted">{detail}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
