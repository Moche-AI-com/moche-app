import Link from 'next/link';
import styles from './landing.module.css';

const MAILTO_BASE = 'mailto:hostspark.org@gmail.com';

// Five distinct intents, per the task spec. Each mailto has its own subject +
// prefilled body so replies land pre-sorted in the inbox. No new API routes
// or forms are introduced -- these are plain links.
const CTA_PATHS = [
  {
    title: 'Beta users',
    detail: 'Get early access and help shape the product.',
    href: `${MAILTO_BASE}?subject=${encodeURIComponent('Beta access request')}&body=${encodeURIComponent("Hi Moche-AI team,\n\nI'd like beta access. Here's a bit about my properties:\n\n")}`,
    label: 'Apply for beta access',
  },
  {
    title: 'Founding members',
    detail: 'Lock in founder pricing and priority support.',
    href: `${MAILTO_BASE}?subject=${encodeURIComponent('Founding member interest')}&body=${encodeURIComponent("Hi Moche-AI team,\n\nI'm interested in the founding member program. Here's a bit about my portfolio:\n\n")}`,
    label: 'Ask about founding pricing',
  },
  {
    title: 'Request a demo',
    detail: 'See a walkthrough with your own properties in mind.',
    href: `${MAILTO_BASE}?subject=${encodeURIComponent('Request a demo')}&body=${encodeURIComponent("Hi Moche-AI team,\n\nI'd like to see a demo. A good time for me is:\n\n")}`,
    label: 'Request a demo',
  },
  {
    title: 'Contact',
    detail: 'Questions about the product or your account.',
    href: `${MAILTO_BASE}?subject=${encodeURIComponent('General inquiry')}&body=${encodeURIComponent('Hi Moche-AI team,\n\n')}`,
    label: 'Contact us',
  },
  {
    title: 'Sign up',
    detail: 'Create your account and add your first property.',
    href: '/signup',
    label: 'Sign up',
  },
] as const;

export function CtaSection() {
  return (
    <section className={styles.ctaSection} aria-labelledby="cta-heading">
      <div className="wrap">
        <h2 id="cta-heading" className={styles.sectionHeading}>
          Pick the path that fits you
        </h2>
        <div className={styles.ctaSectionGrid}>
          {CTA_PATHS.map((path) => {
            const isInternal = path.href.startsWith('/');
            return (
              <div key={path.title} className={`card ${styles.ctaSectionCard}`}>
                <h3 className={styles.ctaSectionTitle}>{path.title}</h3>
                <p className={`muted ${styles.ctaSectionDetail}`}>{path.detail}</p>
                {isInternal ? (
                  <Link href={path.href} className="btn btn-primary btn-block">
                    {path.label}
                  </Link>
                ) : (
                  <a href={path.href} className="btn btn-ghost btn-block">
                    {path.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
