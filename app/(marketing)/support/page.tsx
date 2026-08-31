import type { Metadata } from 'next';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { DocHeader, Related } from '../_parts';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Support',
  description:
    'Get help with Moche-AI: fix a login problem, report an incorrect guest answer, resolve a failed payment, export or delete your data, or report a security issue.',
  path: '/support',
});

// Public help entry point. This is not a knowledge base; it is a router. The
// repo already carries the real playbooks in docs/support/*.md and the binding
// response targets and data-rights process in /legal/support, so duplicating
// either here would create a second version that drifts out of date.
//
// Each row below maps to an existing playbook: login-issue, incorrect-ai-answer,
// failed-payment, data-deletion-request, emergency-safety, security-incident.
//
// Response targets are deliberately NOT restated as numbers on this page. They
// are published, versioned, and contractually meaningful in /legal/support, and
// a marketing page quoting a stale SLA is a promise the company did not make.

const SUPPORT_EMAIL = 'hostspark.org@gmail.com';

function mailto(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const TOPICS = [
  {
    title: 'I cannot sign in',
    detail:
      'Password reset, a magic link that expired, or an email address you no longer control. Include the email on the account and we can verify ownership and restore access.',
    action: 'Email about account access',
    href: mailto(
      'Account access issue',
      'Account email:\n\nWhat happens when I try to sign in:\n\nBrowser and device:\n\n',
    ),
  },
  {
    title: 'The assistant gave a guest a wrong answer',
    detail:
      'Send the property, the question, and what the guest was told. Answers are drawn from your own approved documents, so a wrong answer almost always traces to a stale or missing document in the Property Brain, which is fixable at the source.',
    action: 'Report an incorrect answer',
    href: mailto(
      'Incorrect guest answer',
      'Property:\n\nWhat the guest asked:\n\nWhat the assistant said:\n\nWhat the correct answer is:\n\n',
    ),
  },
  {
    title: 'A payment failed or I was billed incorrectly',
    detail:
      'Billing runs through Stripe and we never store card details. Card data cannot be updated by us on your behalf, so include the invoice reference and we will point you at the right place to retry it.',
    action: 'Email about billing',
    href: mailto('Billing issue', 'Account email:\n\nInvoice reference:\n\nWhat happened:\n\n'),
  },
  {
    title: 'I want to export or delete my data',
    detail:
      'Both are self-serve from Dashboard, then Profile. Export downloads a JSON copy of your account, properties, and content. Deletion is a two-step request and confirm flow. Records that tax and compliance law requires us to keep are listed in the support policy.',
    action: 'Read the data rights process',
    href: '/legal/support',
    internal: true,
  },
  {
    title: 'A guest has an emergency or urgent safety issue',
    detail:
      'Moche-AI is not an emergency service and never handles a safety situation on its own. Contact local emergency services first. Safety and urgent maintenance topics escalate to the host rather than being answered by the assistant.',
    action: 'Read the AI use policy',
    href: '/legal/ai-policy',
    internal: true,
  },
  {
    title: 'I found a security vulnerability',
    detail:
      'Report it directly and privately. Include the affected URL or endpoint, the steps to reproduce, and what you were able to access. Please do not test against another host\u2019s property or a live guest stay.',
    action: 'Report a security issue',
    href: mailto(
      'Security report',
      'Affected URL or endpoint:\n\nSteps to reproduce:\n\nWhat I was able to access:\n\nDate and time (with timezone):\n\n',
    ),
  },
] as const;

export default function SupportPage() {
  return (
    <>
      <DocHeader
        eyebrow="Support"
        title="Get help with Moche-AI"
        lede="Pick the closest topic below. Each one goes to the person who can actually resolve it, with the details we need to skip the first round of back and forth."
        updated="August 2026"
      />

      <div className={styles.body}>
        <div className={styles.callout}>
          <p>
            Support runs by email while we are pre-launch. Published response targets, escalation
            paths, and the full data rights process live in the{' '}
            <Link href="/legal/support">support policy</Link>, which is versioned and dated so you can
            see exactly what has been committed to.
          </p>
        </div>

        <h2>Common topics</h2>
        {TOPICS.map((topic) => (
          <section key={topic.title}>
            <h3>{topic.title}</h3>
            <p>{topic.detail}</p>
            <p>
              {'internal' in topic && topic.internal ? (
                <Link href={topic.href}>{topic.action}</Link>
              ) : (
                <a href={topic.href}>{topic.action}</a>
              )}
            </p>
          </section>
        ))}

        <h2>What to include when you write in</h2>
        <p>
          The single biggest cause of a slow resolution is a report we cannot reproduce. If you can,
          send:
        </p>
        <ul>
          <li>The email address on the account.</li>
          <li>The property name, and the stay or guest link if the issue is guest-facing.</li>
          <li>What you expected to happen and what happened instead.</li>
          <li>The date, time, and timezone.</li>
          <li>Browser and device, for anything visual or interactive.</li>
        </ul>
        <p>
          Please do not send passwords, access codes, or a guest&rsquo;s personal details. We do not
          need them, and we keep that class of data out of logs and telemetry by design.
        </p>

        <h2>Questions that are already answered</h2>
        <p>
          Before writing in, these cover most of what hosts ask first:
        </p>
        <ul>
          <li>
            <Link href="/how-it-works">How it works</Link>, including where answers come from and when
            the assistant escalates instead of answering.
          </li>
          <li>
            <Link href="/guest-experience">What your guests see</Link>, if you are deciding whether to
            put the link in front of a booking.
          </li>
          <li>
            <Link href="/security">Trust and safety</Link>, for data handling, AI routing, and what we
            do and do not certify.
          </li>
          <li>
            The <Link href="/#faq">FAQ on the homepage</Link>, for setup time, cancellation, and
            running Moche-AI alongside an existing messaging tool.
          </li>
        </ul>

        <Related current="/support" />
      </div>
    </>
  );
}
