import type { Metadata } from 'next';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { DocHeader, Related } from '../_parts';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Trust & safety',
  description:
    'How Moche-AI protects host and guest data: per-account isolation, hashed guest identifiers, redaction before model calls, and what we do not yet certify.',
  path: '/security',
});

// The public trust page. This is a plain-language summary of the binding
// document at /legal/security, and it links out to it rather than restating it,
// because two versions of a security posture is a compliance problem waiting to
// happen.
//
// Every control listed here is one that /legal/security already states. The "not
// yet" section is the point of the page: a trust page that only lists strengths
// tells a reader nothing, and a host evaluating an unfamiliar vendor is looking
// specifically for whether the vendor will admit a gap.
export default function SecurityPage() {
  return (
    <>
      <DocHeader
        eyebrow="Trust & safety"
        title="What we do with your data, in plain language"
        lede="You are handing an unfamiliar product the operating details of your properties and the contact details of your guests. This page states what is protected, how, and what we do not yet claim."
        updated="August 2026"
      />

      <div className={styles.body}>
        <div className={styles.callout}>
          <p>
            This page is the readable summary. The binding, versioned document is the{' '}
            <Link href="/legal/security">Security Overview</Link> in our legal center, alongside the{' '}
            <Link href="/legal/dpa">Data Processing Addendum</Link>,{' '}
            <Link href="/legal/subprocessors">subprocessor list</Link>, and{' '}
            <Link href="/legal/ai-policy">AI disclosure and use policy</Link>. Where the two differ,
            the legal document governs.
          </p>
        </div>

        <h2>Separation between accounts</h2>
        <ul>
          <li>
            Database row-level security scopes every host to their own account and their own
            properties. It is enforced at the database, not only in application code.
          </li>
          <li>
            Guests are not database users. Guest reads and writes are explicitly scoped to one property
            and one stay, so a guest link cannot reach another property or another stay.
          </li>
          <li>
            The privileged service key is server-only and is never exposed to a browser.
          </li>
          <li>
            Security-relevant actions are written to an append-only audit log.
          </li>
        </ul>

        <h2>Guest data</h2>
        <ul>
          <li>
            Guest contact identifiers are stored as hashes rather than in the clear.
          </li>
          <li>
            Our logger redacts secrets, tokens, email addresses, and long digit sequences before
            anything is written out. Access codes, phone numbers, and message bodies are kept out of
            error tracking and analytics by design.
          </li>
          <li>
            Automated abuse on guest verification is rate limited.
          </li>
          <li>
            All traffic is served over HTTPS. Data at rest is encrypted by our database and hosting
            providers.
          </li>
        </ul>

        <h2>AI routing, and what models are allowed to keep</h2>
        <p>
          This is the question hosts ask most, so it gets a direct answer.
        </p>
        <ul>
          <li>
            Personally identifiable information is redacted from content before it is sent to any
            external model router.
          </li>
          <li>
            Model requests are routed through a gateway where we request no data retention and opt out
            of provider model training. Your property documents are not training data.
          </li>
          <li>
            The current model-per-task register is published in the{' '}
            <Link href="/legal/ai-policy">AI disclosure and use policy</Link> rather than left vague.
          </li>
          <li>
            Answers are generated only from material you approved for that property, and can cite the
            source. When confidence is low the question escalates to you.{' '}
            <Link href="/how-it-works">How it works</Link> covers the mechanism.
          </li>
        </ul>

        <h2>Payments</h2>
        <p>
          Card data is handled solely by Stripe, which is PCI-DSS compliant, and is never stored by us.
          We cannot see or update your card details, which is also why a billing fix has to be done by
          you rather than by support on your behalf.
        </p>

        <h2>Infrastructure and monitoring</h2>
        <ul>
          <li>
            The platform runs on managed, patched infrastructure. Dependencies are tracked and updated.
          </li>
          <li>
            Application errors and traces are captured for debugging, with the redaction rules above
            applied first.
          </li>
        </ul>

        <h2>Your rights over your data</h2>
        <ul>
          <li>
            <strong>Export.</strong> Download a JSON copy of your account, properties, and content from
            Dashboard, then Profile. Card data is not included because Stripe holds it, not us.
          </li>
          <li>
            <strong>Deletion.</strong> A two-step request and confirm flow removes personal and property
            data. Billing, legal-acceptance, and audit records are retained where tax and compliance law
            requires it.
          </li>
          <li>
            <strong>Breach notification.</strong> We commit to a 72-hour notification window, consistent
            with GDPR Article 33.
          </li>
          <li>
            Data rights requests are acknowledged promptly and fulfilled within statutory timeframes.
            The process is documented in the <Link href="/legal/support">support policy</Link>.
          </li>
        </ul>

        <h2>What we do not claim</h2>
        <p>
          A trust page that lists only strengths is not a trust page. As of this review date:
        </p>
        <ul>
          <li>
            <strong>We do not hold SOC 2, ISO 27001, or any third-party security certification.</strong>{' '}
            Our controls are modeled on recognised frameworks, but modeled on is not audited against,
            and we will not blur the two. Current assurance status is stated in the{' '}
            <Link href="/legal/security">Security Overview</Link>.
          </li>
          <li>
            We do not offer a paid bug bounty. We do read and act on responsible disclosures, and{' '}
            <Link href="/support">support</Link> has the reporting path.
          </li>
          <li>
            We do not claim the assistant cannot be wrong. It is constrained to your approved material
            and it escalates when unsure, which reduces the failure rate but does not make it zero.
          </li>
          <li>
            We do not claim to be an emergency service. Safety situations route to a human, and guests
            are directed to local emergency services.
          </li>
        </ul>

        <h2>Reporting a problem</h2>
        <p>
          If you find a vulnerability, report it privately with the affected endpoint, reproduction
          steps, and what you were able to access. Please do not test against another host&rsquo;s
          property or a live guest stay. The reporting path is on the{' '}
          <Link href="/support">support page</Link>.
        </p>

        <Related current="/security" />
      </div>
    </>
  );
}
