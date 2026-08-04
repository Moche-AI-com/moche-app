import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Native <details>/<summary> rather than a JS accordion: keyboard support,
// screen-reader semantics, and in-page find all work with no client bundle.
// Answers are carried over from the retired public/landing.html so the claims
// stay identical to what was already published.
const FAQS = [
  {
    q: 'Do I have to connect my Airbnb account?',
    a: 'No. Moche-AI is platform-agnostic. Guests reach the portal by QR code or link during the stay, with no Airbnb login, no Vrbo connection, and no PMS integration. Your property data belongs to you, not to a platform API.',
  },
  {
    q: 'What if the assistant gives a wrong answer?',
    a: 'It answers only from the documents and details you have uploaded, and it can cite the source. When confidence is low it escalates to you instead of inventing something. The instruction is simple: inform, never invent.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most hosts finish onboarding in 15 to 20 minutes, and the portal can be live before the next check-in. A completeness score tracks what is still missing and suggests the gaps worth filling first.',
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
