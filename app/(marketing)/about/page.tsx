import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { DocHeader, Related, CtaBand } from '../_parts';
import productBrain from '@/public/premium/product-brain-desktop.png';
import productPortal from '@/public/premium/product-portal-desktop.png';
import productUpdates from '@/public/premium/product-updates-desktop.png';
import styles from '../marketing.module.css';
import pageStyles from './about.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Our Story | Why Moche-AI Built a Better Guest Experience',
  description:
    'Why Moche-AI helps short-term rental hosts turn approved property knowledge into useful guest answers, with a clear path to a human when AI should not guess.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <DocHeader
        eyebrow="About Moche-AI"
        title="Our story: better answers for every stay"
        lede="We built Moche-AI to help short-term rental hosts make their property knowledge useful to guests, without giving up control of what the assistant says."
      />

      <article className={`${styles.body} ${pageStyles.article}`}>
        <div className={pageStyles.intro}>
          <p>
            A great guest experience depends on details: where to park, how to connect to Wi-Fi,
            what to do when something stops working, and whom to contact when the answer is not in
            the guide. For a host, those details are often scattered across documents, old messages,
            and memory.
          </p>
          <p>
            Moche-AI was built to put that knowledge to work without asking hosts to surrender
            control of what guests are told. We are an independent guest-operations product built in
            Somerville, Massachusetts, for short-term rental hosts.
          </p>
        </div>

        <nav className={pageStyles.contents} aria-label="On this page">
          <span>Explore our approach</span>
          <a href="#the-problem">The problem</a>
          <a href="#property-knowledge">Property knowledge</a>
          <a href="#guest-experience">The guest experience</a>
          <a href="#host-control">Host control</a>
          <a href="#where-we-stand">Where we stand</a>
        </nav>

        <section className={pageStyles.problem} id="the-problem" aria-labelledby="problem-heading">
          <div className={pageStyles.sectionNumber}>01 / The challenge</div>
          <div>
            <h2 id="problem-heading">The problem we set out to solve</h2>
            <p>
              Guests need useful answers at the moment a question arises, not only when someone is
              available to reply. Hosts, meanwhile, should not have to rewrite the same instructions
              for every stay. A generic chatbot is not enough: if it invents a check-in detail or an
              appliance instruction, a fast answer becomes a worse guest experience. That is why we
              start with the property&apos;s knowledge, not with the chat window.
            </p>
          </div>
        </section>

        <section className={pageStyles.feature} id="property-knowledge" aria-labelledby="knowledge-heading">
          <div className={pageStyles.copy}>
            <div className={pageStyles.sectionNumber}>02 / The foundation</div>
            <h2 id="knowledge-heading">Property knowledge comes first</h2>
            <p>
              Each property has a Property Brain for the details its host provides and approves:
              check-in instructions, Wi-Fi, house rules, appliance notes, and the particulars that
              make a stay run smoothly. The guest assistant draws on that property-specific
              information and can cite the source behind an answer. If the approved material does not
              support an answer, the assistant should say so and bring in the host rather than fill
              the gap with a guess. <Link href="/how-it-works">See how Moche-AI works</Link>.
            </p>
          </div>
          <figure className={pageStyles.figure}>
            <a href={productBrain.src} target="_blank" rel="noopener noreferrer" aria-label="Open the Property Brain screenshot at full size">
              <Image src={productBrain} alt="Moche-AI Property Brain showing host-managed property knowledge organized by topic" sizes="(max-width: 760px) 100vw, 46vw" className={pageStyles.image} />
            </a>
            <figcaption>Hosts organize and approve the details guests can ask about before those details become guest-facing answers.</figcaption>
          </figure>
        </section>

        <section className={`${pageStyles.feature} ${pageStyles.reverse}`} id="guest-experience" aria-labelledby="guest-heading">
          <div className={pageStyles.copy}>
            <div className={pageStyles.sectionNumber}>03 / The experience</div>
            <h2 id="guest-heading">A guest experience that keeps people connected</h2>
            <p>
              Guests access their stay&apos;s portal through a link or QR code, without installing an
              app or connecting the host&apos;s booking platform. From there, they can find property
              information, ask questions, contact the host, and use the guest-facing options available
              for their stay. Moche-AI supports the host&apos;s work; it does not replace their judgment
              or turn an urgent situation into an automated conversation.
            </p>
          </div>
          <figure className={pageStyles.figure}>
            <a href={productPortal.src} target="_blank" rel="noopener noreferrer" aria-label="Open the guest portal screenshot at full size">
              <Image src={productPortal} alt="Moche-AI guest portal with property information and routes to ask questions or contact the host" sizes="(max-width: 760px) 100vw, 46vw" className={pageStyles.image} />
            </a>
            <figcaption>The guest portal puts property answers and a route to the host in one place.</figcaption>
          </figure>
        </section>

        <section className={pageStyles.feature} id="host-control" aria-labelledby="control-heading">
          <div className={pageStyles.copy}>
            <div className={pageStyles.sectionNumber}>04 / The safeguard</div>
            <h2 id="control-heading">Hosts stay in control</h2>
            <p>
              An assistant may help identify a gap in a property&apos;s information, but a proposed
              update does not become guest-facing knowledge until a host approves it. Hosts can review
              what the system knows, correct outdated details, and decide when a question needs a
              human response. The principle behind that approval step is simple: <strong>inform, never
              invent.</strong>
            </p>
          </div>
          <figure className={pageStyles.figure}>
            <a href={productUpdates.src} target="_blank" rel="noopener noreferrer" aria-label="Open the knowledge updates screenshot at full size">
              <Image src={productUpdates} alt="Moche-AI knowledge updates queue showing proposed changes awaiting host approval" sizes="(max-width: 760px) 100vw, 46vw" className={pageStyles.image} />
            </a>
            <figcaption>Proposed knowledge updates wait for a host to review them; they do not publish themselves.</figcaption>
          </figure>
        </section>

        <section className={pageStyles.disclosure} id="where-we-stand" aria-labelledby="stand-heading">
          <div className={pageStyles.sectionNumber}>05 / Accountability</div>
          <h2 id="stand-heading">Clear about where we stand</h2>
          <p>
            Moche-AI is in public beta, with an official launch planned for January 1, 2027. You
            can sign up and build one draft property without a card, then preview the guest portal
            and AI answers. An active paid plan is required to publish a property for guests. Plan
            prices and included limits are displayed in the <Link href="/#pricing">pricing
            section</Link>. We will not claim customer counts or security certifications we cannot
            substantiate, or suggest that an assistant is always right.
          </p>
          <p>
            Read our <Link href="/security">trust and safety information</Link> for the controls
            we describe and the claims we do not make. Our <Link href="/legal">Legal Center</Link>
            publishes the governing policies and their versions. If you need help, spot an incorrect
            guest answer, or want to exercise a data right, <Link href="/support">reach
            support</Link>. You should be able to reach a person and inspect our commitments without
            needing a founder biography.
          </p>
          <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>
        </section>

        <div className={pageStyles.endMatter}>
          <CtaBand text="Build and preview one draft property free, no card. Choose a paid plan to publish." />
          <Related current="/about" />
        </div>
      </article>
    </>
  );
}
