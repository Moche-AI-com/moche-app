import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import { DocHeader, Related, CtaBand } from '../../_parts';
import productDashboard from '@/public/premium/product-dashboard-desktop.png';
import productBrain from '@/public/premium/product-brain-desktop.png';
import productPortal from '@/public/premium/product-portal-desktop.png';
import styles from '../../marketing.module.css';
import pageStyles from './guide.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Guest Communication Guide for Short-Term Rental Hosts',
  description:
    'A practical guest communication guide: understand Airbnb response rules, make property answers easy to find, and know when a human should step in.',
  path: '/resources/guest-communication-guide',
});

const sources = [
  { href: 'https://www.airbnb.com/help/article/2414', label: 'Airbnb Help Center: Why hosts are asked to respond within 24 hours' },
  { href: 'https://www.airbnb.com/help/article/430', label: 'Airbnb Help Center: Improve your response rate and response time' },
  { href: 'https://www.airbnb.com/help/article/829', label: 'Airbnb Help Center: What is required to be a Superhost' },
] as const;

export default function GuestCommunicationGuidePage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Guest communication guide for short-term rental hosts',
    description: metadata.description,
    inLanguage: 'en-US',
    dateModified: '2026-09-24',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/resources/guest-communication-guide` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <DocHeader
        eyebrow="Host guide"
        title="Guest communication guide for short-term rental hosts"
        lede="Make the right answer easy to find during a stay, while keeping booking-platform replies and human decisions in the right hands."
      />

      <article className={`${styles.body} ${pageStyles.story}`}>
        <p className={pageStyles.lead}>
          A guest at the front door does not want to search a long PDF for the entry instructions.
          A host does not want to explain the same Wi-Fi password to every new booking. Better guest
          communication starts before either message is sent: put accurate property details where
          guests can reach them, and make it clear when they should contact a person.
        </p>

        <h2>Two channels, two different jobs</h2>
        <p>
          Airbnb asks hosts to respond to reservation requests, booking inquiries, and guest
          messages within 24 hours. Late responses can lower the response rate and increase response
          time, and Airbnb says response rate can affect a listing&apos;s place in search results. Its
          standard response-rate measure concerns new inquiries and reservation requests answered
          within 24 hours over the past 30 days; its Superhost assessment uses a different measure
          based on new message threads over the past 12 months.{' '}
          <a href="https://www.airbnb.com/help/article/2414">Read Airbnb&apos;s response guidance</a>{' '}
          and <a href="https://www.airbnb.com/help/article/430">calculation details</a>.
        </p>
        <p>
          Those are booking-platform obligations. Moche-AI is an in-stay guest portal, not an Airbnb
          inbox integration: a reply from its assistant should not be counted on to satisfy an Airbnb
          response deadline. Keep handling inquiries, reservation requests, and urgent platform
          messages in the channel where they arrived. Use the portal to make routine property facts
          easier for an arrived guest to find.
        </p>

        <h2>Start with the questions guests actually ask</h2>
        <p>
          Review recent messages for each property and note which questions repeat. Common topics to
          prepare for include Wi-Fi and connection help; entry, parking, and checkout; the actual
          appliances and thermostat; house rules and trash; and local recommendations. Do not assume
          the same answer works at every property or in every season.
        </p>
        <figure className={pageStyles.figure}>
          <a href={productDashboard.src} target="_blank" rel="noopener noreferrer" aria-label="Open the host dashboard screenshot at full size">
            <Image src={productDashboard} alt="Moche-AI host dashboard with a per-property breakdown of guest question topics" sizes="(max-width: 820px) 100vw, 800px" className={pageStyles.image} />
          </a>
          <figcaption>The host dashboard helps show which topics guests ask about, so hosts can improve the right property instructions.</figcaption>
        </figure>

        <h2>Write answers once, at the property level</h2>
        <p>
          A message pasted into eleven booking threads is eleven copies to keep current. Instead,
          record each property&apos;s facts in one place. Write for a first-time guest holding a
          phone: name the right door or device, explain the next step, include what to do if it
          fails, and date details that change seasonally. Review sensitive access instructions
          before making them available to guests.
        </p>
        <p>
          Moche-AI calls this per-property record the Property Brain. Hosts can add and approve
          knowledge there; the assistant draws on approved details and can cite its source. A
          proposed update does not automatically become a guest-facing answer.{' '}
          <Link href="/how-it-works">See how the approval process works</Link>.
        </p>
        <figure className={pageStyles.figure}>
          <a href={productBrain.src} target="_blank" rel="noopener noreferrer" aria-label="Open the Property Brain screenshot at full size">
            <Image src={productBrain} alt="Moche-AI Property Brain with property knowledge organized for host review" sizes="(max-width: 820px) 100vw, 800px" className={pageStyles.image} />
          </a>
          <figcaption>One host-approved source for each property is easier to correct than answers scattered across old threads.</figcaption>
        </figure>

        <h2>Make answers reachable during the stay</h2>
        <p>
          Guests need a short path from question to answer. Moche-AI gives each stay a link or QR
          code to its guest portal, without asking the guest to install an app or the host to
          connect a booking platform. Guests can look up approved property information, ask a
          question, or contact the host. If the approved material does not support an answer, the
          assistant should say so and escalate rather than guess.
        </p>
        <figure className={pageStyles.figure}>
          <a href={productPortal.src} target="_blank" rel="noopener noreferrer" aria-label="Open the guest portal screenshot at full size">
            <Image src={productPortal} alt="Moche-AI guest portal with options to ask questions and contact the host" sizes="(max-width: 820px) 100vw, 800px" className={pageStyles.image} />
          </a>
          <figcaption>The guest portal places self-service answers beside a clear route to a real person.</figcaption>
        </figure>

        <h2>Know where automation should stop</h2>
        <p>
          Fixed, approved property facts can be offered as self-service answers. A priced request,
          such as late checkout, can be captured for the host to decide; it should not be treated
          as approved just because a guest asked. Maintenance reports can collect useful detail,
          but someone responsible for the property still needs to assess and act. Complaints,
          refunds, access failures, safety issues, and emergencies need timely human judgment.
          For an immediate emergency, guests should contact local emergency services.
        </p>
        <p>
          Airbnb&apos;s <a href="https://www.airbnb.com/help/article/829">Superhost criteria</a>{' '}
          include responding to 90% of new messages and accepting or declining new reservation
          requests within 24 hours. That is another reason to keep the distinction clear: a helpful
          in-stay portal supports the guest experience; it does not take over your platform
          response responsibilities.
        </p>

        <h2>A simple communication audit</h2>
        <ol>
          <li>Review recent guest messages for one property and group repeat questions by topic.</li>
          <li>Write or correct one property-specific answer for each repeat question, including the failure case.</li>
          <li>Check what guests can actually reach during a stay, on a phone, without asking you first.</li>
          <li>Keep a clear path to the host for uncertainty, exceptions, and urgent problems.</li>
        </ol>
        <p>
          Start with a single property and improve the source as new questions appear. Moche-AI
          lets you build and preview one draft property without a card; a paid plan is required to
          publish it for guests. <Link href="/guest-experience">See what guests see</Link> and{' '}
          <Link href="/security">review our trust and safety information</Link> before you share a portal.
        </p>
        <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>

        <div className={pageStyles.endMatter}>
          <CtaBand text="Build and preview one draft property free, no card. Choose a paid plan to publish." />
          <Related current="/resources/guest-communication-guide" />
        </div>
        <div className={pageStyles.sources}>
          <h2>Sources</h2>
          <ol>
            {sources.map((source) => (
              <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
            ))}
          </ol>
        </div>
      </article>
    </>
  );
}
