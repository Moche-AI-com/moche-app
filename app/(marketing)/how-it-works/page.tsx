import type { Metadata } from 'next';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_URL } from '@/lib/seo';
import { DocHeader, Related, CtaBand } from '../_parts';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'How Moche-AI works',
  description:
    'A grounded guest assistant for short-term rentals: load your property details, give guests one link, get cited answers that escalate when confidence is low.',
  path: '/how-it-works',
});

// The informative article. The homepage has a three-step "How it works" section,
// which is a summary; this page is the canonical explanation and goes a layer
// deeper into the retrieval and escalation behaviour, because that is the part a
// technically literate host actually wants to interrogate before trusting it.
//
// The homepage section keeps its #how-it-works anchor. That is a fragment, not a
// competing URL, so there is no canonical conflict.
//
// Claims are constrained to what is already published: the three setup steps and
// the six system parts (System.tsx), the escalation and citation behaviour and
// the 15 to 20 minute setup figure (Faq.tsx), the model routing and PII handling
// (/legal/security and /legal/ai-policy).

const FAQS = [
  {
    q: 'Where do the answers come from?',
    a: 'Only from the documents and property details you have loaded and approved. Answers can cite which source they came from, so you can check them.',
  },
  {
    q: 'What happens when the assistant does not know?',
    a: 'It escalates to you rather than guessing. Low confidence, safety topics, and urgent maintenance route to a human every time.',
  },
  {
    q: 'Do I have to connect my Airbnb or Vrbo account?',
    a: 'No. Moche-AI is platform-agnostic. Guests reach the portal by a link or QR code for their stay, with no guest login, no channel connection, and no property management system requirement.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most hosts finish onboarding in 15 to 20 minutes. A completeness score tracks what is still missing and suggests which gaps are worth filling first.',
  },
  {
    q: 'Can I run it alongside a messaging tool I already use?',
    a: 'Yes. Pre-arrival messaging tools handle booking confirmations and check-in reminders. Moche-AI is the in-stay layer for the questions that come up once guests are physically inside the property.',
  },
] as const;

export default function HowItWorksPage() {
  // FAQPage structured data. These five questions are the ones hosts ask before
  // signing up, and they are the ones most likely to be typed into a search box
  // verbatim, so they are marked up rather than left as plain prose.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/how-it-works#faq`,
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <DocHeader
        eyebrow="How it works"
        title="A guest assistant that can only answer from what you approved"
        lede="Moche-AI turns your scattered property knowledge into one structured source, then answers guest questions from it and cites where each answer came from. This page explains the mechanics end to end."
        updated="August 2026"
      />

      <div className={styles.body}>
        <h2>The three steps to being live</h2>
        <ol className={styles.steps}>
          <li>
            <h3>Load what you already know</h3>
            <p>
              The manual, the Wi-Fi details, the appliance quirks, check-in, parking, house rules.
              Upload documents or type them in. A completeness score shows which gaps are worth filling
              first, so you are not staring at an empty form wondering what matters. Most hosts finish
              in 15 to 20 minutes.
            </p>
          </li>
          <li>
            <h3>Give guests one link</h3>
            <p>
              One link or QR code per stay. No app to install, no guest account to create, no channel
              connection. The same flow works whether the booking came from Airbnb, Vrbo, or your own
              direct site.
            </p>
          </li>
          <li>
            <h3>Stay in the loop, not in the thread</h3>
            <p>
              Routine questions answer themselves from your material. Anything the system is not
              confident about, or anything touching safety, comes to you with the context already
              attached.
            </p>
          </li>
        </ol>

        <h2>What is actually running underneath</h2>
        <p>
          Chat is the interface, not the product. Six parts do the work:
        </p>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Property Brain</td>
              <td>The per-property knowledge base every answer is drawn from.</td>
            </tr>
            <tr>
              <td>Guest portal</td>
              <td>One link per stay, on any booking platform.</td>
            </tr>
            <tr>
              <td>Concierge requests</td>
              <td>Late checkout, towels, recommendations. Captured as structured requests and routed.</td>
            </tr>
            <tr>
              <td>Maintenance triage</td>
              <td>Issues arrive with detail and priority already attached.</td>
            </tr>
            <tr>
              <td>Review prompts</td>
              <td>Timed to the moment a guest will actually leave one.</td>
            </tr>
            <tr>
              <td>Owner insight</td>
              <td>What guests keep asking, per property, over time.</td>
            </tr>
          </tbody>
        </table>

        <h2>How a single answer is produced</h2>
        <p>
          This is the part worth understanding, because it is where most guest-facing assistants go
          wrong.
        </p>
        <ol>
          <li>
            A guest asks a question in the portal for their specific stay. The request is scoped to
            that property and that stay, not to your whole portfolio.
          </li>
          <li>
            The relevant passages are retrieved from that property&rsquo;s approved material. Nothing
            outside it is eligible.
          </li>
          <li>
            An answer is composed from those passages, with the source available so it can be checked
            rather than taken on faith.
          </li>
          <li>
            If the retrieved material does not support a confident answer, the question escalates to
            you instead of being filled in from general knowledge.
          </li>
        </ol>
        <div className={styles.callout}>
          <p>
            <strong>Inform, never invent.</strong> An assistant that is confidently wrong about a
            lockbox code costs more trust than a hundred correct answers earn. The design tradeoff is
            made in favour of saying &ldquo;let me get the host&rdquo; more often than a general
            chatbot would.
          </p>
        </div>
        <p>
          The assistant can also propose an update to a property&rsquo;s knowledge base when it notices
          a gap, for example a question three guests have asked that nothing covers. It cannot publish
          that update itself. A human approves it first. See{' '}
          <Link href="/security">trust and safety</Link> for the data handling and model routing behind
          all of this.
        </p>

        <h2>What guests see, and what they do not</h2>
        <p>
          Guests see a portal for their stay, in a browser, with no account. They do not see your other
          properties, other guests, your notes to yourself, or anything you have not published to the
          Brain. Contact identifiers are stored as hashes rather than in the clear. The full walkthrough
          is on <Link href="/guest-experience">the guest experience page</Link>.
        </p>

        <h2>Questions hosts ask about the mechanics</h2>
        {FAQS.map((f) => (
          <section key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </section>
        ))}

        <h2>Where it fits with the tools you already run</h2>
        <p>
          Moche-AI is not a channel manager, a pricing tool, or a property management system, and it
          does not try to replace one. It is the in-stay layer. If you already use a pre-arrival
          messaging tool, keep it. The overlap is close to zero: those tools send scheduled messages
          before arrival, and this one answers unscheduled questions during the stay. The{' '}
          <Link href="/resources/guest-communication-guide">guest communication guide</Link> covers how
          to split the two without duplicating messages.
        </p>

        <CtaBand text="Load one property and see the completeness score for yourself. Free until January 1, 2027." />
        <Related current="/how-it-works" />
      </div>
    </>
  );
}
