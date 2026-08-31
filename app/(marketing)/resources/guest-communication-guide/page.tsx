import type { Metadata } from 'next';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { DocHeader, Related, CtaBand, Sources } from '../../_parts';
import styles from '../../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Guest communication guide',
  description:
    'A guest communication guide for short-term rental hosts: the 24-hour response window, the questions worth pre-answering, and what to never hand off.',
  path: '/resources/guest-communication-guide',
});

// The SEO pillar. Target query is informational and commercial-investigation
// ("short-term rental guest communication", "airbnb guest communication
// template", "how fast do I have to reply to guests"), so the format is a long
// guide with scannable subheads rather than a product page.
//
// Every external claim carries a real URL in the Sources block. The Airbnb
// numbers are quoted from Airbnb's own help center rather than from a competitor
// blog, because an aggregator restating a platform rule is not a source.
//
// Product mentions are confined to the last two sections. A guide that pivots to
// a pitch in paragraph three does not get linked to, and the point of a pillar
// page is that other people link to it.

const SOURCES = [
  {
    label:
      'Airbnb Help Center — Why hosts are asked to respond within 24 hours (response window, late responses, effect on search position)',
    href: 'https://www.airbnb.com/help/article/2414',
  },
  {
    label:
      'Airbnb Help Center — Improve your response rate and response time (how response rate and response time are calculated)',
    href: 'https://www.airbnb.com/help/article/430',
  },
  {
    label: 'Airbnb Help Center — What\u2019s required to be a Superhost (90% response, 4.8 rating, under 1% cancellation)',
    href: 'https://www.airbnb.com/help/article/829',
  },
] as const;

export default function GuestCommunicationGuidePage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${SITE_URL}/resources/guest-communication-guide#article`,
    headline: 'The guest communication guide for short-term rental hosts',
    description:
      'The 24-hour response window, the questions worth pre-answering, what to automate, and what to never hand off.',
    inLanguage: 'en-US',
    dateModified: '2026-08-31',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/resources/guest-communication-guide`,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <DocHeader
        eyebrow="Host guide"
        title="The guest communication guide for short-term rental hosts"
        lede="Guest messaging is the part of hosting that scales worst and gets measured hardest. This guide covers the response rules that actually affect your listing, the questions worth answering before they are asked, and where automation stops being a good idea."
        updated="August 2026"
      />

      <div className={styles.body}>
        <h2>The clock you are actually being measured against</h2>
        <p>
          Guest communication feels like a soft skill. On Airbnb it is a scored metric, and the numbers
          are published.
        </p>
        <ul>
          <li>
            Hosts are asked to respond to reservation requests, booking inquiries, and all other guest
            messages{' '}
            <a href="https://www.airbnb.com/help/article/2414" rel="nofollow noopener" target="_blank">
              within 24 hours
            </a>
            . Anything slower is recorded as a late response, which lowers your response rate and raises
            your response time.
          </li>
          <li>
            Airbnb states that response rate{' '}
            <a href="https://www.airbnb.com/help/article/2414" rel="nofollow noopener" target="_blank">
              can affect a listing&rsquo;s position in search results
            </a>
            . Slow replies are not just a service problem, they are a distribution problem.
          </li>
          <li>
            Response rate is calculated from your{' '}
            <a href="https://www.airbnb.com/help/article/430" rel="nofollow noopener" target="_blank">
              first reply to each new message thread over the past 12 months
            </a>
            , assessed quarterly. Response time is the average across all new messages in the past 30
            days. Follow-up messages in an existing thread do not count, and you do not have to send the
            last message in a conversation.
          </li>
          <li>
            Superhost status requires replying to{' '}
            <a href="https://www.airbnb.com/help/article/829" rel="nofollow noopener" target="_blank">
              90% of new messages
            </a>
            , plus a 4.8 overall rating, a cancellation rate under 1%, and either 10 reservations or 3
            reservations totaling at least 100 nights.
          </li>
        </ul>
        <div className={styles.callout}>
          <p>
            The structural problem: the metric is driven by <em>first replies to new threads</em>, and
            new threads arrive at times you do not control. One guest messaging at 1am about a lockbox
            can cost you a quarter&rsquo;s response rate more than fifty daytime messages can earn back.
          </p>
        </div>

        <h2>The five questions that generate most of your inbox</h2>
        <p>
          Across almost every property, the same handful of questions dominate. They are not
          interesting, which is exactly why they are worth engineering away.
        </p>
        <ol>
          <li>
            <strong>Wi-Fi.</strong> The network name and password, and what to do when the router needs
            a restart.
          </li>
          <li>
            <strong>Getting in.</strong> Where the entrance is, how the lock works, what happens if the
            code fails, and where to park.
          </li>
          <li>
            <strong>Appliances.</strong> The coffee machine, the induction hob, the shower, the
            thermostat, the washer. The specific device, not a generic manual.
          </li>
          <li>
            <strong>Times and rules.</strong> Check-in, checkout, quiet hours, trash day, whether the
            deposit covers the dog.
          </li>
          <li>
            <strong>Locally, where do we go.</strong> Food that is open now, the nearest pharmacy,
            whether the beach is walkable.
          </li>
        </ol>
        <p>
          Every one of these has a fixed, correct, property-specific answer. None of them requires
          judgement. If a guest is messaging you about any of them, the information existed and was not
          reachable.
        </p>

        <h2>Write answers once, at the property level</h2>
        <p>
          The common failure is storing answers in the wrong place. A paragraph pasted into eleven
          booking threads is not a record, it is eleven copies that will drift the moment the router is
          replaced.
        </p>
        <p>Structure it per property, and write for a stranger holding a phone in a dark hallway:</p>
        <ul>
          <li>
            <strong>One fact per entry.</strong> &ldquo;Wi-Fi&rdquo; is a topic. &ldquo;Network name is
            X, password is Y, router is in the hall cupboard, restart takes 90 seconds&rdquo; is an
            entry.
          </li>
          <li>
            <strong>Include the failure case.</strong> Most guest messages are not about the happy path,
            they are about what happens when the code does not work.
          </li>
          <li>
            <strong>Name the actual device.</strong> &ldquo;Turn on the coffee machine&rdquo; is useless.
            &ldquo;The black Nespresso on the left of the sink, lift the lever, drop the pod in&rdquo; is
            not.
          </li>
          <li>
            <strong>Date anything seasonal.</strong> Pool closed November to March. Trash day changed in
            June. Undated seasonal facts are the most common source of a confidently wrong answer.
          </li>
        </ul>

        <h2>What to automate, and what to never hand off</h2>
        <p>
          There is a clean line here, and crossing it is how hosts end up with a horror story about a
          bot.
        </p>
        <table>
          <thead>
            <tr>
              <th>Message type</th>
              <th>Handle it how</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fixed property facts (Wi-Fi, parking, appliances, rules)</td>
              <td>Automate fully. There is one right answer and it does not change per guest.</td>
            </tr>
            <tr>
              <td>Pre-arrival logistics (confirmation, check-in reminder)</td>
              <td>Schedule it. This is what pre-arrival messaging tools are for.</td>
            </tr>
            <tr>
              <td>Requests with a cost (late checkout, extra guest, early access)</td>
              <td>Capture automatically, decide manually. The capture is the work, not the decision.</td>
            </tr>
            <tr>
              <td>Maintenance reports</td>
              <td>Triage automatically to gather detail and priority, then a human acts.</td>
            </tr>
            <tr>
              <td>Complaints, refund requests, disputes</td>
              <td>Never automate. A templated reply to a complaint escalates it.</td>
            </tr>
            <tr>
              <td>Safety, medical, security, or anything urgent</td>
              <td>Never automate. Route to a human and to local emergency services.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The test is simple. If being wrong costs the guest money, safety, or access to the property, a
          human decides.
        </p>

        <h2>Five rules that survive contact with real guests</h2>
        <ol>
          <li>
            <strong>Answer where they are standing.</strong> A guest at the door will not open a 40-page
            PDF. Anything needed at the threshold has to be one tap away.
          </li>
          <li>
            <strong>Never guess in writing.</strong> &ldquo;I think the code is&rdquo; is worse than
            &ldquo;let me check and come back in five minutes&rdquo;. Wrong information in writing gets
            quoted back to you in a review.
          </li>
          <li>
            <strong>Reply first, solve second.</strong> The response clock measures your first reply, not
            your resolution. An acknowledgement inside the window buys you time.
          </li>
          <li>
            <strong>Fix the source, not the thread.</strong> Every question you answer twice is a missing
            entry. Answering it a third time is a choice.
          </li>
          <li>
            <strong>Ask for the review when the goodwill exists.</strong> Immediately after you solved
            something is when a guest is most willing. Days later, they have forgotten.
          </li>
        </ol>

        <h2>A 30-minute audit you can run today</h2>
        <ol className={styles.steps}>
          <li>
            <h3>Pull your last 50 guest messages</h3>
            <p>Any platform. Read them as a list rather than as conversations.</p>
          </li>
          <li>
            <h3>Tag each one: fact, request, problem, or judgement</h3>
            <p>
              Most hosts find 60% or more are facts. That share is your automation ceiling, and it is
              usually much higher than expected.
            </p>
          </li>
          <li>
            <h3>Write every repeated fact into a per-property record</h3>
            <p>One fact per entry, failure case included, seasonal items dated.</p>
          </li>
          <li>
            <h3>Make it reachable from the property, not from your phone</h3>
            <p>
              A record only you can read does not reduce your inbox. It has to be reachable by the guest
              at the moment the question occurs to them.
            </p>
          </li>
        </ol>

        <h2>Where Moche-AI fits</h2>
        <p>
          That last step is the one hosts stall on, and it is what we built. Moche-AI turns the
          per-property record into a Property Brain, gives each stay one link or QR code with no guest
          app or login, and answers from your approved material with the source attached. When your
          material does not support a confident answer, it escalates to you rather than guessing, which
          is the automation line in the table above enforced in software.
        </p>
        <p>
          It is not a channel manager and it does not replace a pre-arrival messaging tool. It is the
          in-stay layer. See <Link href="/how-it-works">how it works</Link> for the mechanics,{' '}
          <Link href="/guest-experience">what your guests see</Link> for the guest side, and{' '}
          <Link href="/security">trust and safety</Link> for how guest data is handled.
        </p>

        <CtaBand text="Run the audit, then load the results into one property. Free until January 1, 2027." />
        <Sources items={SOURCES} />
        <Related current="/resources/guest-communication-guide" />
      </div>
    </>
  );
}
