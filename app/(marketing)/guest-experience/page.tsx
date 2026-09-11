import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { marketingMetadata } from '@/lib/marketing/metadata';
import portal from '@/public/premium/portal-hero.jpg';
import { DocHeader, Related, CtaBand, PageHero } from '../_parts';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'What your guests see',
  description:
    'A walkthrough of the Moche-AI guest portal: one link per stay, no app, no login, answers from your approved property details, requests that reach you as tasks.',
  path: '/guest-experience',
});

// Written for the host who is deciding whether to put this link in front of a
// paying booking. The objection being answered is not "is it useful" but "what
// will my guest be subjected to", so the page is structured around what a guest
// does and does not encounter, including the friction points.
//
// Claims are limited to behaviour already published: one link or QR per stay, no
// guest login or app, answers cited from approved material, escalation on low
// confidence, structured concierge and maintenance requests, review prompts, and
// hashed guest contact identifiers.
export default function GuestExperiencePage() {
  return (
    <>
      <DocHeader
        eyebrow="Guest view"
        title="What your guests actually see"
        lede="Before you put a link in front of a paying booking, you should know exactly what is on the other side of it. This is the whole guest path, including the parts that are not frictionless."
        updated="August 2026"
      />

      <PageHero
        src={cottage}
        alt="A cliffside cottage at dusk with warm light in the windows"
        caption="A cliffside cottage at dusk. What a guest sees when they arrive, and where every question they are about to ask begins."
        priority
      />

      <div className={styles.body}>
        <figure style={{ margin: '0 0 2rem' }}>
          <Image
            src={portal}
            alt="The Moche-AI guest portal open in a phone browser during a stay"
            sizes="(min-width: 720px) 68ch, 100vw"
            style={{ width: '100%', height: 'auto', borderRadius: 12 }}
            priority
          />
        </figure>

        <h2>The first thing a guest touches</h2>
        <p>
          One link, or a QR code, for their stay. It opens in whatever browser is already on their
          phone.
        </p>
        <p>
          There is no app to download, no account to create, and no password. That is a deliberate
          tradeoff: an app install is the single largest drop-off point in guest-facing software, and a
          guest standing outside a locked door at 11pm will not clear an app store to get in. A stay
          link opens in one tap.
        </p>

        <h2>What they can ask, and where the answer comes from</h2>
        <p>
          The questions that actually get asked are unglamorous and constant. Wi-Fi. Parking. Check-in
          and checkout times. Which switch is the porch light. How the coffee machine works. Where to
          put the trash. Whether the beach is walkable.
        </p>
        <p>
          Every answer is drawn from the material you loaded and approved for that property, and can
          cite the source. If your material does not support a confident answer, the question comes to
          you instead of being invented. Guests are not shown an authoritative-sounding guess.
        </p>
        <div className={styles.callout}>
          <p>
            <strong>The honest version of this:</strong> the portal is exactly as good as the Property
            Brain behind it. A thin Brain produces a lot of &ldquo;let me get the host&rdquo;. The
            completeness score exists to stop that from being a surprise, and{' '}
            <Link href="/how-it-works">how it works</Link> explains how the retrieval is constrained.
          </p>
        </div>

        <h2>When a guest wants something, not just an answer</h2>
        <p>
          Questions are only half of guest messaging. The other half is requests, and those arrive as
          structured items rather than as a paragraph you have to interpret at 7am.
        </p>
        <ul>
          <li>
            <strong>Concierge requests.</strong> Late checkout, extra towels, a restaurant
            recommendation. Captured with the detail attached and routed to you.
          </li>
          <li>
            <strong>Maintenance issues.</strong> A guest reports the shower, and it reaches you with
            the property, the detail, and a priority already on it, instead of the words &ldquo;the
            bathroom is broken&rdquo;.
          </li>
          <li>
            <strong>Safety and urgency.</strong> These do not get answered by the assistant. They route
            to a human, and guests are directed to local emergency services where that is the correct
            answer.
          </li>
        </ul>

        <h2>The review moment</h2>
        <p>
          Review prompts are timed to when a guest is actually willing to leave one, rather than fired
          the moment the stay ends. A guest who got a straight answer at 11pm on their first night is a
          materially different reviewer from one who waited until morning for it.
        </p>

        <h2>What a guest cannot see</h2>
        <p>
          This matters as much as the feature list, and it is enforced at the database rather than only
          in the interface.
        </p>
        <ul>
          <li>Your other properties.</li>
          <li>Any other guest, stay, or message.</li>
          <li>Internal notes, or anything you have not approved into the Brain.</li>
          <li>Your pricing, your calendar, or your account.</li>
        </ul>
        <p>
          Guest reads and writes are scoped to one property and one stay. Guest contact identifiers are
          stored as hashes rather than in the clear. The full posture is on{' '}
          <Link href="/security">trust and safety</Link>.
        </p>

        <h2>What this replaces, and what it does not</h2>
        <p>
          It replaces the repeat questions and the 6-message thread about parking. It does not replace
          you. A guest who wants to negotiate an early check-in, or who has a real problem, still ends
          up talking to a human, just with the context already gathered. The{' '}
          <Link href="/resources/guest-communication-guide">guest communication guide</Link> covers
          which messages are worth automating and which ones you should never hand over.
        </p>

        <CtaBand text="Set up one property and send yourself the guest link before you send it to anyone else." />
        <Related current="/guest-experience" />
      </div>
    </>
  );
}
