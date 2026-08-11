import Image from 'next/image';
import fortMyers from '@/public/landing/moche-guest-portal-fort-myers.webp';
import serviceReport from '@/public/landing/moche-service-report-example.webp';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Four steps, rewritten away from the previous abstract "how it works" copy.
//
// Two claims were removed rather than reworded, because neither can be proved
// from shipped behaviour on a public page: the 20-minute setup time (no
// measured, approved metric) and "answers cite the source" (nothing in the
// supplied guest-facing screenshot shows a guest seeing citations). The
// escalation claim survives because the product routes unresolved questions to
// the host, which is what the fourth step and the service report both show.
const STEPS = [
  {
    n: '01',
    title: 'Add what you know',
    detail: 'Bring together property details, house rules, and stay information.',
  },
  {
    n: '02',
    title: 'Review guest-facing information',
    detail: 'Keep the property knowledge your guests rely on accurate and up to date.',
  },
  {
    n: '03',
    title: 'Give guests one place to ask',
    detail: 'Guests can get help during their stay without another message thread.',
  },
  {
    n: '04',
    title: 'Step in when it matters',
    detail: 'Moche routes unresolved or restricted questions back to the host.',
  },
] as const;

const PARTS = [
  { title: 'Property Brain', detail: 'The per-property knowledgebase every answer is drawn from.' },
  { title: 'Guest portal', detail: 'One link per stay, on any booking platform.' },
  { title: 'Concierge requests', detail: 'Late checkout, towels, recommendations, captured and routed.' },
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
          Ready before your next check-in
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

        {/* Both images are real product output, sanitized before commit, and
            lazy-loaded: they sit well below the fold. */}
        <div className={styles.systemProof}>
          <Reveal as="figure" className={styles.proofFigure}>
            <Image
              src={fortMyers}
              alt="The Moche guest portal for a second property, Fort Myers Vacation House, showing the same set of help cards as the first property."
              width={716}
              height={900}
              sizes="(min-width: 900px) 40vw, 90vw"
              className={styles.proofImage}
              loading="lazy"
            />
            <figcaption className={styles.proofCaption}>
              The same guest experience, shaped by each property&apos;s own information.
            </figcaption>
          </Reveal>

          <Reveal as="figure" delay={80} className={styles.proofFigure}>
            <Image
              src={serviceReport}
              alt="A Moche service report for a leaking bathroom faucet, listing the property, type, urgency, status, reported time, location, reported issue, access instructions, guest availability, likely causes, suggested parts, and a timeline."
              width={644}
              height={900}
              sizes="(min-width: 900px) 40vw, 90vw"
              className={styles.proofImage}
              loading="lazy"
            />
            <figcaption className={styles.proofCaption}>
              When a guest reports a problem, it reaches you with the detail you need to act on it.
            </figcaption>
          </Reveal>
        </div>

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
