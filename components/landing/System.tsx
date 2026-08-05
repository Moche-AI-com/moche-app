import { Reveal } from './Reveal';
import styles from './landing.module.css';

// The page went hero -> four benefit lines -> offer -> price with nothing in
// between explaining what the product actually is or does, so a visitor who
// was not already sold had to infer the mechanics from the FAQ. This section
// carries that weight: three steps for how it runs, then a plain register of
// the parts of the system.
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
      'House manual, Wi-Fi, appliance quirks, check-in steps, parking, house rules. A completeness score tracks what is still missing and which gaps are worth filling first. Most hosts finish in 15 to 20 minutes.',
  },
  {
    n: '02',
    title: 'Give guests one link',
    detail:
      'Each stay gets a portal reached by QR code or link. No app to download, no Airbnb login, no PMS integration — so it works the same whether the booking came from Airbnb, Vrbo, or direct.',
  },
  {
    n: '03',
    title: 'Stay in the loop, not in the thread',
    detail:
      'Answers are drawn from your own documents and can cite the source. When confidence is low it escalates to you rather than inventing something, and requests arrive with enough detail to act on.',
  },
] as const;

const PARTS = [
  {
    title: 'Property Brain',
    detail: 'The per-property knowledgebase every answer is drawn from, and the reason it improves the longer you host.',
  },
  {
    title: 'Guest portal',
    detail: 'One QR code or link per stay, on any booking platform, with no guest account to create.',
  },
  {
    title: 'Concierge requests',
    detail: 'Late checkout, extra towels, local recommendations — captured, structured, and routed to you.',
  },
  {
    title: 'Maintenance triage',
    detail: 'Issues arrive with the detail and priority attached instead of as a vague text at 11pm.',
  },
  {
    title: 'Review prompts',
    detail: 'Timed to the moment in the stay when a guest is most likely to actually leave one.',
  },
  {
    title: 'Owner insight',
    detail: 'What guests keep asking about, per property, over time — and what it says to fix.',
  },
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
