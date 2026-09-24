import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import { DocHeader, Related, CtaBand } from '../_parts';
import portalHome from '@/public/premium/Guest_Portal_Page.png';
import messageHost from '@/public/premium/Guest_Portal_Message_Host_Directly.png';
import serviceRequest from '@/public/premium/Guest_Service_Request.png';
import styles from '../marketing.module.css';
import pageStyles from './guest-experience.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'What Guests See in the Moche-AI Portal',
  description: 'Walk through the Moche-AI guest portal: property-specific answers, direct host contact, and service requests, with no guest app or account required.',
  path: '/guest-experience',
});

export default function GuestExperiencePage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'What guests see in the Moche-AI portal',
    description: metadata.description,
    inLanguage: 'en-US',
    dateModified: '2026-09-24',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/guest-experience` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <DocHeader
        eyebrow="Guest view"
        title="What a guest sees after opening your stay link"
        lede="A useful guest portal should make the everyday details easy to find, and make it just as easy to reach a person when a question needs one. Here is the journey from the guest side."
      />

      <article className={`${styles.body} ${pageStyles.story}`}>
        <p className={pageStyles.lead}>
          Imagine arriving after a long drive. The guest wants the Wi-Fi details, a parking reminder,
          and a way to tell the host if the shower is not working. Moche-AI puts those paths in one
          property-specific portal instead of asking the guest to search through old messages.
        </p>

        <h2>One stay link, no new account</h2>
        <p>
          The host shares a link or QR code for the stay. Guests open it in their browser; they do not
          need to install an app or create a guest account. Access is for the relevant stay and
          property, not a directory of the host&apos;s other homes. A portal does not replace the
          booking-platform inbox or the host&apos;s responsibility to respond there.
        </p>
        <figure className={pageStyles.figure}>
          <a href={portalHome.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative guest portal home screen at full size">
            <Image src={portalHome} alt="Illustrative Moche-AI guest portal home screen" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative guest portal home: a place to start with the property&apos;s in-stay information.</figcaption>
        </figure>

        <h2>Find the ordinary details quickly</h2>
        <p>
          A guest can look for the information that matters on arrival: Wi-Fi, parking, check-in,
          house rules, appliance notes, and local recommendations. If a topic does not cover their
          question, they can ask in the portal. Answers should be grounded in the details the host
          has approved for that property, rather than a plausible guess about a different home.
        </p>
        <p>
          The experience depends on what the host has supplied. A missing instruction should not
          become an invented lockbox code or a confident-sounding safety answer. When the approved
          information does not support an answer, the guest needs a clear path back to the host.
          For the host-side setup, read <Link href="/how-it-works">how Moche-AI works</Link>.
        </p>

        <h2>Reach the host without a detour</h2>
        <p>
          Self-service is useful until the guest has a situation only a person can resolve. The
          portal offers a direct way to message the host about a problem, ask for a decision, or
          explain something the property information did not cover. A request for early check-in,
          a complaint, or an access issue remains a host decision, not an AI promise.
        </p>
        <figure className={pageStyles.figure}>
          <a href={messageHost.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative message-host screen at full size">
            <Image src={messageHost} alt="Illustrative Moche-AI guest screen for messaging the host directly" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative host contact: guests can move from self-service to a human conversation.</figcaption>
        </figure>

        <h2>Make a service request</h2>
        <p>
          A guest may need more than an answer: extra towels, help with a broken appliance, or
          another stay-related service. The service-request path helps them describe what they need
          and lets the host review the details. Availability, timing, and any charge still require
          the host&apos;s decision; submitting a request is not an automatic approval.
        </p>
        <figure className={pageStyles.figure}>
          <a href={serviceRequest.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative service-request screen at full size">
            <Image src={serviceRequest} alt="Illustrative Moche-AI guest service-request screen" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative request flow: the guest can provide the host with context rather than only sending a vague message.</figcaption>
        </figure>

        <h2>Know when to leave the portal</h2>
        <p>
          A guest should contact the host directly about urgent maintenance, access failures, or
          safety concerns. For an emergency, they should contact local emergency services first.
          Moche-AI can help surface property information and collect context, but it is not an
          emergency response service or a replacement for human judgment.
        </p>
        <p>
          Before sharing the portal with a booking, build and preview one draft property yourself.
          Check the guest link, confirm that the key instructions are current, and test how a
          question and a request reach you. You can preview a draft without a card; an active paid
          plan is required to publish it for guests. See the <Link href="/resources/guest-communication-guide">guest communication guide</Link>
          for what belongs in the portal versus a scheduled message, and <Link href="/security">trust and safety</Link>
          for information-handling details.
        </p>
        <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>

        <div className={pageStyles.endMatter}>
          <CtaBand text="Build and preview one draft property free, no card. Choose a paid plan to publish." />
          <Related current="/guest-experience" />
        </div>
      </article>
    </>
  );
}
