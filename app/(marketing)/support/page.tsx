import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { DocHeader, Related } from '../_parts';
import guestEntry from '@/public/premium/Guest_Sign_Signin.png';
import guestLocalRecs from '@/public/premium/Guest Portal_Local_Recs.png';
import styles from '../marketing.module.css';
import pageStyles from './support.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Support for Moche-AI Hosts',
  description: 'Get help with account access, guest portal issues, incorrect answers, billing, data rights, and private security reporting. Learn what to include without sharing guest secrets.',
  path: '/support',
});

const emailFor = (subject: string) =>
  `mailto:hostspark.org@gmail.com?subject=${encodeURIComponent(subject)}`;

export default function SupportPage() {
  return (
    <>
      <DocHeader
        eyebrow="Help for hosts"
        title="When a stay or account needs a person"
        lede="Choose the closest issue, send the details that help us investigate, and keep passwords, entry codes, and guest personal information out of the report."
      />

      <article className={`${styles.body} ${pageStyles.story}`}>
        <p className={pageStyles.lead}>
          Start with the issue you can describe. Support can help investigate product and account
          problems; a host handles property decisions, and local emergency services handle emergencies.
          Hosts can reach support from the dashboard or by email. The <Link href="/legal/support">support policy</Link>
          has current response targets and data-rights procedures; targets are goals, not a guaranteed
          resolution time.
        </p>

        <h2>Account access</h2>
        <p>
          If a sign-in link expired or you cannot access your account, tell us the account email,
          what you see when you try to sign in, and your browser and device. Never send a password
          or one-time code. <a href={emailFor('Account access issue')}>Email about account access</a>.
        </p>

        <h2>An incorrect guest answer or recommendation</h2>
        <p>
          Tell us the property, what the guest asked or viewed, the answer or recommendation shown,
          and what the correct information should be. Check whether the property instructions are
          current, but do not assume stale content is the only possible cause. If the guest needs
          immediate help, contact them directly rather than waiting for an investigation.
          <a href={emailFor('Incorrect guest answer')}> Report an incorrect answer</a>.
        </p>
        <figure className={pageStyles.figure}>
          <a href={guestLocalRecs.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative guest local recommendations screen at full size">
            <Image src={guestLocalRecs} alt="Illustrative Moche-AI guest local-recommendations screen" sizes="(max-width: 640px) 100vw, 800px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative guest view: a property-specific recommendation is the kind of detail a host can report and correct.</figcaption>
        </figure>

        <h2>A guest portal problem</h2>
        <p>
          If the stay link does not open, a guest cannot find a topic, or an action fails, tell us
          the property name, the action attempted, the approximate time and timezone, and the browser
          and device. A redacted screenshot may help. Do not email a live guest link, access code,
          or guest contact details. <a href={emailFor('Guest portal issue')}>Email about the guest portal</a>.
        </p>
        <figure className={pageStyles.figure} style={{ maxWidth: 560 }}>
          <a href={guestEntry.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative guest stay-access screen at full size">
            <Image src={guestEntry} alt="Illustrative guest stay-access screen before entering the portal" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative guest access: if a stay link or entry step fails, tell support which step the guest reaches.</figcaption>
        </figure>

        <h2>Billing and data rights</h2>
        <p>
          For a failed payment or unexpected invoice, send your account email, invoice reference,
          and what happened. Stripe handles payment cards; do not send a card number or security code.
          <a href={emailFor('Billing issue')}> Email about billing</a>.
        </p>
        <p>
          Hosts can export or request deletion from Dashboard, then Profile. The
          <Link href="/legal/support"> data-rights process</Link> also explains how guests or people
          without dashboard access can make a request and how legally required records are handled.
        </p>

        <h2>Safety and security reports</h2>
        <p>
          For a guest emergency, contact local emergency services first and the host directly;
          this support inbox and the AI assistant are not emergency response channels. Read the
          <Link href="/legal/ai-policy"> AI use policy</Link> for the assistant&apos;s limits.
        </p>
        <p>
          Report a suspected vulnerability privately with the affected area, reproduction steps,
          and date and time. Do not test against another host&apos;s property or a live guest stay.
          <a href={emailFor('Security report')}> Report a security issue</a>.
        </p>

        <h2>Before you write in</h2>
        <p>
          Include what you expected, what happened instead, when it happened, and the browser or
          device if relevant. Use a property name rather than a guest&apos;s personal details.
          For product walkthroughs, see <Link href="/how-it-works">how it works</Link>,
          <Link href="/guest-experience"> the guest experience</Link>, and
          <Link href="/security"> trust and safety</Link>.
        </p>
        <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>
        <div className={pageStyles.endMatter}><Related current="/support" /></div>
      </article>
    </>
  );
}
