import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Native <details>/<summary> rather than a JS accordion: keyboard support,
// screen-reader semantics, and in-page find all work with no client bundle.
//
// Two answers were retired rather than reworded. The old "what if it gives a
// wrong answer" copy said guests can see a cited source, which the supplied
// guest-facing screenshot does not show, and the old setup-time answer quoted
// 15 to 20 minutes, which is not a measured, approved metric. Both are
// replaced by the approved escalation wording below. The data-export answer is
// unchanged.
const FAQS = [
  {
    q: 'Do I have to connect my Airbnb account?',
    a: 'No. Moche-AI is platform-agnostic. Guests reach the portal by QR code or link during the stay, with no Airbnb login, no Vrbo connection, and no PMS integration. Your property data belongs to you, not to a platform API.',
  },
  {
    q: 'What happens if Moche does not know the answer?',
    a: 'Moche is designed to use property information provided and controlled by the host. When it cannot provide a reliable answer, or the topic needs host confirmation, it routes the question to the host.',
  },
  {
    q: 'Will Moche sound generic?',
    a: "Moche is shaped around each property's information and the host's preferences, so guest support can reflect the stay rather than a generic script.",
  },
  {
    q: 'Do I need to replace my PMS?',
    a: 'No. Moche is designed to fit your existing hosting workflow without requiring a PMS migration.',
  },
  {
    q: 'Is this just a chatbot?',
    a: 'No. Chat is only the interface. The product is the property knowledgebase underneath it, plus the concierge, maintenance, review, and owner-insight workflows that run on top of it.',
  },
  {
    q: 'Can I run it alongside Hospitable or HostBuddy?',
    a: 'Yes, they are complementary. Keep your pre-arrival messaging tool for booking confirmations and check-in reminders. Moche-AI is the in-stay layer for the Wi-Fi, appliance, and local questions that come up once guests are physically inside.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'You own your data. Export your Property Brain documents and structured profile at any time. Because the Brain is built from your own property details, the value compounds the longer you host, but you are never locked in.',
  },
] as const;

export function Faq() {
  return (
    <section className={styles.faq} id="faq" aria-labelledby="faq-heading">
      <div className="wrap">
        <Reveal as="h2" id="faq-heading" className={styles.sectionHeading}>
          Questions hosts ask before signing up
        </Reveal>
        <div className={styles.faqList}>
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 45}>
              <details className={styles.faqItem}>
                <summary className={styles.faqSummary}>
                  <span>{item.q}</span>
                  <span className={styles.faqChevron} aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <div className={styles.faqAnswer}>
                  <p className="muted">{item.a}</p>
                </div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
