import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import { DocHeader, Related, CtaBand } from '../_parts';
import guestCodeEntry from '@/public/premium/Guest_Sign_Code_Entry.png';
import guestPortal from '@/public/premium/Guest_Portal_Light_Theme.png';
import styles from '../marketing.module.css';
import pageStyles from './how-it-works.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'How Moche-AI Works for Short-Term Rental Hosts',
  description: 'See how Moche-AI turns host-approved property details into an in-stay guest portal, source-backed answers, and a clear route to the host when a human should decide.',
  path: '/how-it-works',
});

export default function HowItWorksPage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'How Moche-AI works for short-term rental hosts',
    description: metadata.description,
    inLanguage: 'en-US',
    dateModified: '2026-09-24',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/how-it-works` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <DocHeader
        eyebrow="How it works"
        title="A guest portal built from the details you approve"
        lede="Moche-AI turns property knowledge into a practical in-stay experience: guests can find answers, and hosts remain responsible for the decisions that need a person."
      />

      <article className={`${styles.body} ${pageStyles.story}`}>
        <p className={pageStyles.lead}>
          A short-term rental is full of answers guests need at inconvenient moments: where to park,
          how to enter, which Wi-Fi network to use, and what to do when something is not working.
          Moche-AI gives each property a host-approved source for those details, then makes that
          source reachable during a stay.
        </p>

        <h2>Start with the property, not the chat</h2>
        <p>
          Hosts add the practical details they already know: arrival instructions, Wi-Fi, parking,
          house rules, appliance notes, and local guidance. Moche-AI organizes that information
          by property so that an answer for one home is not accidentally used for another. The host
          can review and correct the knowledge before it reaches guests.
        </p>
        <p>
          That matters because the useful unit is not a generic answer; it is the right answer for
          the particular place a guest has booked. If a detail changes, update the property record
          instead of trying to find every old message where it was pasted.
        </p>

        <h2>Give each stay a simple way in</h2>
        <p>
          Guests reach the portal through a link or QR code for their stay. They do not need to
          download an app or create an account, and hosts do not need to connect an Airbnb, Vrbo,
          or property-management-system account. The portal is an in-stay experience; it does not
          replace a host&apos;s booking-platform inbox or its response obligations.
        </p>
        <figure className={`${pageStyles.figure} ${pageStyles.portrait}`}>
          <a href={guestCodeEntry.src} target="_blank" rel="noopener noreferrer" aria-label="Open the illustrative stay-code entry screen at full size">
            <Image src={guestCodeEntry} alt="Illustrative Moche-AI guest portal screen for entering a stay code" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative guest access: a stay code opens the property-specific portal without a guest account.
          </figcaption>
        </figure>

        <h2>Make approved answers easy to find</h2>
        <p>
          Inside the portal, guests can start with familiar topics such as Wi-Fi, check-in, parking,
          house rules, appliance help, and local recommendations. They can also ask a question.
          The assistant uses the material approved for that property; it is not meant to invent a
          missing lockbox code, safety instruction, or appliance detail from general knowledge.
        </p>
        <figure className={`${pageStyles.figure} ${pageStyles.portrait}`}>
          <a href={guestPortal.src} target="_blank" rel="noopener noreferrer" aria-label="Open the illustrative guest portal screen at full size">
            <Image src={guestPortal} alt="Illustrative Moche-AI light guest portal with choices to ask questions, message a host, request service, and view extras" sizes="(max-width: 640px) 100vw, 560px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative guest portal: self-service information sits alongside direct access to the host and other stay options.
          </figcaption>
        </figure>

        <h2>Keep a human in the loop</h2>
        <p>
          The correct answer is sometimes that the portal does not know. When approved material does
          not support a confident answer, the assistant should say so and route the guest back to
          the host rather than guess. Hosts also decide requests that carry a cost, such as early
          check-in or late checkout, and remain responsible for complaints, access failures, safety
          concerns, urgent maintenance, refunds, and emergencies.
        </p>
        <p>
          This is the operating principle behind Moche-AI: <strong>inform, never invent.</strong>
          Automation can make routine information easier to reach. It should not make a human
          decision where the cost of being wrong is a guest&apos;s money, safety, or access to a home.
        </p>

        <h2>What Moche-AI is—and is not</h2>
        <p>
          Moche-AI is the in-stay layer for host-approved property knowledge and guest questions.
          It is not a channel manager, pricing tool, or property-management system. Keep using the
          tools that send booking confirmations and pre-arrival messages; use Moche-AI to make the
          property-specific information guests need once they arrive easier to find.
        </p>
        <p>
          You can build and preview one draft property without a card. An active paid plan is
          required to publish a property for guests. See <Link href="/guest-experience">what guests see</Link>,
          read the <Link href="/resources/guest-communication-guide">guest communication guide</Link>,
          or review <Link href="/security">trust and safety information</Link> before you share
          a portal.
        </p>
        <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>

        <div className={pageStyles.endMatter}>
          <CtaBand text="Build and preview one draft property free, no card. Choose a paid plan to publish." />
          <Related current="/how-it-works" />
        </div>
      </article>
    </>
  );
}
