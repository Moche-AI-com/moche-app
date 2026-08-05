import { Clock, Star, MessageSquare, Brain } from 'lucide-react';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Outcome-led, per the product language rules: each title is a result the host
// gets, not a feature the software has.
//
// Deliberately unboxed. This used to be four bordered, shadowed cards holding
// two-line paragraphs, which made the densest block on the page out of the
// least surprising claims. The card chrome and half the words are gone; the
// detail line is now one clause, sized down, so the four titles read as a
// scannable row rather than four things to read in full.
const BENEFITS = [
  {
    Icon: Clock,
    title: 'Save hours every week',
    detail: 'Routine questions answer themselves. You step in only where it counts.',
  },
  {
    Icon: Star,
    title: 'More reviews, better ratings',
    detail: 'Every booking gets nudged toward a review at the right moment.',
  },
  {
    Icon: MessageSquare,
    title: 'Instant guest answers',
    detail: 'Wi-Fi, parking, check-in, house rules — answered day or night.',
  },
  {
    Icon: Brain,
    title: 'Knowledge that stays put',
    detail: 'Every property detail in one place, not scattered notes and memory.',
  },
] as const;

export function Benefits() {
  return (
    <section className={styles.benefits} aria-labelledby="benefits-heading">
      <div className="wrap">
        <Reveal as="h2" id="benefits-heading" className={styles.sectionHeading}>
          Built for the way hosts actually work
        </Reveal>
        <ul className={styles.benefitsGrid}>
          {BENEFITS.map(({ Icon, title, detail }, i) => (
            <Reveal as="li" key={title} delay={i * 60} className={styles.benefitsItem}>
              <Icon size={18} strokeWidth={1.75} aria-hidden className={styles.benefitsIcon} />
              <h3 className={styles.benefitsTitle}>{title}</h3>
              <p className={styles.benefitsDetail}>{detail}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
