import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Sits immediately under the hero and answers the first objection cold traffic
// has about anything described as AI: what happens when it does not know.
//
// The example below is deliberately NOT a chat mock-up. A coded replica of the
// guest UI would be a fabricated screenshot, so this is plain labelled text --
// "Example scenario", stated as intended behaviour, not as a live result, a
// customer conversation, or a guarantee. The question used is a policy
// exception (late checkout) rather than a factual lookup, because the point
// being made is the escalation, not the retrieval.
const PILLARS = [
  {
    title: 'Grounded in your property',
    detail:
      'Moche uses the property instructions, house rules, guides, and recommendations you provide.',
  },
  {
    title: 'You stay in control',
    detail: 'Keep property information current and decide what is appropriate for guests.',
  },
  {
    title: 'Escalates instead of guessing',
    detail: 'When Moche does not have a reliable answer, it routes the question back to the host.',
  },
] as const;

export function Trust() {
  return (
    <section className={styles.trust} id="how-answers-work" aria-labelledby="trust-heading">
      <div className="wrap">
        <Reveal as="h2" id="trust-heading" className={styles.sectionHeading}>
          Inform, never invent.
        </Reveal>
        <Reveal as="p" delay={50} className={`muted ${styles.trustLead}`}>
          Answers are based on the information you provide. Hosts review and control the property
          information guests rely on.
        </Reveal>

        <div className={styles.trustGrid}>
          <dl className={styles.trustPillars}>
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 60} className={styles.trustPillar}>
                <dt className={styles.trustPillarTitle}>{pillar.title}</dt>
                <dd className={styles.trustPillarDetail}>{pillar.detail}</dd>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={120} className={styles.example}>
            <p className={styles.exampleLabel}>Example scenario</p>
            <dl className={styles.exampleBody}>
              <dt>Guest</dt>
              <dd>&ldquo;Can I check out at 3 PM tomorrow?&rdquo;</dd>
              <dt>Moche</dt>
              <dd>
                &ldquo;Late checkout availability has not been approved for this stay. I&apos;ve
                sent this to your host so they can confirm.&rdquo;
              </dd>
            </dl>
            <p className={styles.exampleStatus}>Escalated to host, no answer invented</p>
            <p className={styles.exampleNote}>
              An illustration of intended behaviour, not a real conversation or a guaranteed
              outcome.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
