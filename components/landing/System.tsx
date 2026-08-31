import { Reveal } from './Reveal';
import styles from './landing.module.css';

// The page went hero -> four benefit lines -> offer -> price with nothing in
// between explaining what the product actually is or does, so a visitor who
// was not already sold had to infer the mechanics from the FAQ. This section
// carries that weight: three steps for how it runs, then a plain register of
// the parts of the system.
//
// Copy is deliberately short. The first pass wrote three-sentence steps and a
// full sentence per part, and at six parts plus three steps that put ~180 words
// of body text in one section -- the density undid the point of unboxing the
// benefits above it. Each step is now one line of mechanics plus one line of
// consequence, and each part is a single clause.
//
// Every claim here is already made elsewhere on the page or in the FAQ
// (platform-agnostic portal, completeness score, cited answers, escalation on
// low confidence, the concierge/maintenance/review/owner workflows). Nothing
// new is promised and no numbers are invented.
const STEPS = [
  {
    n: '01',
    title: 'Load what you know',
    detail:
      'Manual, Wi-Fi, quirks, check-in, parking, rules. A completeness score shows the gaps worth filling first, so you are never staring at an empty form.',
  },
  {
    n: '02',
    title: 'Give guests one link',
    detail:
      'One QR code or link per stay. No app, no guest login, no PMS — the same on Airbnb, Vrbo, or direct.',
  },
  {
    n: '03',
    title: 'Stay in the loop, not in the thread',
    detail:
      'Answers come from your own documents and cite the source. Low confidence escalates to you instead of guessing.',
  },
] as const;

const PARTS = [
  { title: 'Property Brain', detail: 'The per-property knowledgebase every answer is drawn from.' },
  { title: 'Guest portal', detail: 'One link per stay, on any booking platform.' },
  { title: 'Concierge requests', detail: 'Late checkout, towels, recommendations — captured and routed.' },
  { title: 'Maintenance triage', detail: 'Issues arrive with detail and priority attached.' },
  { title: 'Review prompts', detail: 'Timed to when a guest will actually leave one.' },
  { title: 'Owner insight', detail: 'What guests keep asking, per property, over time.' },
] as const;

export function System() {
  return (
    <section className={styles.system} id="how-it-works" aria-labelledby="system-heading">
      <div className="wrap">
        <Reveal as="span" className={styles.eyebrow}>
          How it works
        </Reveal>
        <Reveal as="h2" id="system-heading" className={styles.sectionHeading}>
          Live before your next check-in
        </Reveal>

        <ol className={styles.steps}>
          {/* Scroll-linked rule that draws itself through the steps as the
              section passes the viewport. Decorative and CSS-only. */}
          <span className={styles.stepsRule} aria-hidden />
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.n} delay={i * 70} className={styles.step}>
              <span className={styles.stepNum} aria-hidden>
                {step.n}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDetail}>{step.detail}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal as="h3" className={styles.partsHeading}>
          What is running underneath
        </Reveal>
        <dl className={styles.parts}>
          {PARTS.map((part, i) => (
            <Reveal key={part.title} delay={i * 45} className={styles.part}>
              <dt className={styles.partTitle}>{part.title}</dt>
              <dd className={styles.partDetail}>{part.detail}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
