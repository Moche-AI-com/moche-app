import type { Metadata } from 'next';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { DocHeader, Related, CtaBand } from '../_parts';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'About Moche-AI',
  description:
    'Moche-AI is an independent, founder-led guest operations product for short-term rental hosts. Read why we built it and what we refuse to claim.',
  path: '/about',
});

// The brand article. Written to be the page a cautious host reads before
// trusting an unfamiliar product with their property data, so it is deliberately
// specific about what the company is and is not: pre-launch, independent, small,
// and unwilling to publish numbers it cannot show.
//
// Every factual claim here is already published elsewhere in this repo (the
// January 1 2027 launch date and free-until-launch offer in Pricing.tsx, the
// "inform, never invent" instruction in Faq.tsx, "Built in Somerville, MA" in
// LandingFooter.tsx, the security posture in /legal/security). No headcount,
// funding, customer count, or vanity metric appears, because none of those are
// verifiable from anything the company has actually published.
export default function AboutPage() {
  return (
    <>
      <DocHeader
        eyebrow="Our story"
        title="We built the thing we kept asking other hosts for"
        lede="Moche-AI is an independent guest operations product for short-term rental hosts, built in Somerville, Massachusetts. This page explains where it came from, how we make decisions, and what we will not claim."
        updated="August 2026"
      />

      <div className={styles.body}>
        <h2>The problem we started with</h2>
        <p>
          Every short-term rental accumulates a body of knowledge that lives nowhere. The Wi-Fi
          password is in a text message from 2023. The trick to the dishwasher is in the host&rsquo;s
          head. Parking is explained in a paragraph pasted into the last eleven booking threads. The
          guest who arrives at 11pm and cannot find the light switch does not have access to any of
          it, so they message the host, and the host answers the same question they answered a week
          ago.
        </p>
        <p>
          Hosts already carry a hard clock on that. Airbnb asks hosts to reply to reservation
          requests, inquiries and guest messages{' '}
          <a href="https://www.airbnb.com/help/article/2414" rel="nofollow noopener" target="_blank">
            within 24 hours
          </a>
          , counts anything slower as a late response, and says response rate can affect where a
          listing sits in search results. Superhost status requires replying to{' '}
          <a href="https://www.airbnb.com/help/article/829" rel="nofollow noopener" target="_blank">
            90% of new messages
          </a>{' '}
          on top of a 4.8 rating and a cancellation rate under 1%. The work is not optional, and it
          does not scale with the number of properties.
        </p>

        <h2>What we decided to build instead of a chatbot</h2>
        <p>
          The obvious product is a bot bolted onto a messaging inbox. We did not build that, because
          the failure mode of a bot is that it is confidently wrong in front of a paying guest, and a
          single invented answer about a lockbox code costs more trust than a hundred correct ones
          earn.
        </p>
        <p>
          So the product is the knowledge base first and the chat second. Each property gets a
          Property Brain: the manual, the quirks, the check-in instructions, the house rules, the
          appliance notes, all in one structured place that the host owns and approves. Guest answers
          are drawn from that and can cite which document they came from. When confidence is low, the
          question escalates to the host instead of being guessed at.
        </p>
        <div className={styles.callout}>
          <p>
            <strong>The instruction the whole product is built around: inform, never invent.</strong>{' '}
            If the answer is not in the material a host approved, the correct behaviour is to say so
            and hand the question to a human.
          </p>
        </div>
        <p>
          It is also deliberately platform-agnostic. There is no Airbnb login to connect, no Vrbo
          integration, and no property management system requirement. Guests reach the portal by a
          link or QR code for their stay. That decision costs us some convenience features. It buys
          hosts the guarantee that their property knowledge is not held inside somebody else&rsquo;s
          API. <Link href="/how-it-works">How it works</Link> covers the mechanics in full.
        </p>

        <h2>How we operate</h2>
        <ul>
          <li>
            <strong>Independent and founder-led.</strong> Moche-AI is a small independent team, not a
            venture-scaled organisation with a sales floor. When you email support, the reply comes
            from someone who works on the product.
          </li>
          <li>
            <strong>Built in Somerville, MA.</strong> One place, one legal entity, published in our{' '}
            <Link href="/legal">legal center</Link>.
          </li>
          <li>
            <strong>Host approves, machine proposes.</strong> The assistant can suggest an update to a
            property&rsquo;s knowledge base. It cannot publish one to guests. A human accepts it
            first.
          </li>
          <li>
            <strong>Your data leaves with you.</strong> Property Brain documents and the structured
            profile export on request, and account deletion is a real two-step flow rather than a
            support ticket. Both are documented in the{' '}
            <Link href="/legal/support">support policy</Link>.
          </li>
        </ul>

        <h2>Where we are right now</h2>
        <p>
          Moche-AI is pre-launch. General availability is January 1, 2027. Accounts created before
          then are free until launch and no card is charged before that date. After launch the pricing
          is per property and published openly on the homepage rather than hidden behind a call.
        </p>
        <p>
          We are telling you this on the page that exists to earn your trust because the alternative
          is worse: a product that implies scale it does not have is a product that will disappoint
          you in month two.
        </p>

        <h2>What we will not claim</h2>
        <p>
          A short list, kept here on purpose so it can be held against us:
        </p>
        <ul>
          <li>
            No customer counts, review counts, or &ldquo;trusted by thousands of hosts&rdquo; line
            until there is a number we can show you.
          </li>
          <li>
            No claim that the assistant is always right. It answers from your material, cites it, and
            escalates when it is unsure. That is the honest ceiling.
          </li>
          <li>
            No security certification we do not hold. Our{' '}
            <Link href="/security">trust and safety page</Link> states the controls that are actually
            in place and names the ones that are not.
          </li>
          <li>
            No pretending a guest assistant replaces you in an emergency. Safety and urgent
            maintenance route to a human every time.
          </li>
        </ul>

        <h2>Talk to us</h2>
        <p>
          If something on this page reads as marketing rather than fact, say so and we will either
          substantiate it or remove it. <Link href="/support">Support</Link> has the ways to reach us,
          including for security reports and data rights requests.
        </p>

        <CtaBand text="Early accounts are free until the January 1, 2027 launch. No card required." />
        <Related current="/about" />
      </div>
    </>
  );
}
