import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { marketingMetadata } from '@/lib/marketing/metadata';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import { DocHeader, Related } from '../_parts';
import approvalQueue from '@/public/premium/product-updates-desktop.png';
import styles from '../marketing.module.css';
import pageStyles from './security.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'How Moche-AI Protects Host and Guest Data',
  description: 'A plain-language look at property and stay access, data protection, AI model routing, human oversight, and the security assurances Moche-AI does and does not make.',
  path: '/security',
});

export default function SecurityPage() {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'How Moche-AI protects host and guest data',
    description: metadata.description,
    inLanguage: 'en-US',
    dateModified: '2026-09-24',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/security` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <DocHeader
        eyebrow="Trust in practice"
        title="The boundaries around your property and guest data"
        lede="Hosts need to know who can reach their property details, where guest questions go, and when a person stays in control. Here is the plain-language view, including what we do not claim."
      />

      <article className={`${styles.body} ${pageStyles.story}`}>
        <p className={pageStyles.lead}>
          A guest needs the right instructions for one stay. A host needs confidence that this link
          will not expose another property, another guest, or an internal note. Security is not a
          badge on a page; it is the set of boundaries around that ordinary interaction.
        </p>
        <p>
          This article summarizes the published controls. For the detailed, maintained terms, read
          the <Link href="/legal/security">Security Overview</Link>, <Link href="/legal/dpa">Data Processing Addendum</Link>,
          <Link href="/legal/ai-policy"> AI Disclosure &amp; Use Policy</Link>, and <Link href="/legal/subprocessors">subprocessor list</Link>.
          Where this summary differs from a legal document, the legal document governs.
        </p>

        <h2>Access follows the account and stay</h2>
        <p>
          Database row-level security scopes host access to the host&apos;s own account and properties.
          Guests are not database users: guest reads and writes are explicitly scoped by property
          and stay. The service-role key is kept on the server, not sent to a browser. These controls
          are intended to keep a stay link from becoming a route to a different home or guest record.
        </p>
        <p>
          The published Security Overview also describes encryption in transit and at rest through
          the database and hosting providers. Guest contact identifiers are stored as irreversible
          hashes rather than plaintext. A guest link should still be shared with the intended guest,
          not posted publicly.
        </p>

        <h2>AI has a narrower job</h2>
        <p>
          Moche-AI uses host-provided property material to answer in-stay questions. When the
          material does not support a confident answer, the assistant should decline to guess and
          route the issue to the host. Safety concerns and emergencies are for people and local
          emergency services, not for a chatbot to resolve. See <Link href="/how-it-works">how answers work</Link>
          for the guest-facing boundary.
        </p>
        <p>
          The <Link href="/legal/ai-policy">AI policy</Link> describes redaction before external
          model routing and a check that blocks a routed request if personal data is still detected.
          It also describes fallback behavior and requests to providers not to log, retain, or train
          on prompts and responses. Consult the published AI policy and
          <Link href="/legal/subprocessors"> subprocessor list</Link> for the current processing details.
        </p>

        <h2>A host decides what goes live</h2>
        <p>
          A suggested update to property knowledge is not the same as an approved guest answer.
          Drafted updates wait for a host to review them before publication. Hosts also decide
          requests involving availability, timing, or money. The assistant does not make a booking,
          take payment, or dispatch someone for a guest.
        </p>
        <figure className={pageStyles.figure}>
          <a href={approvalQueue.src} target="_blank" rel="noopener noreferrer" aria-label="Open illustrative host approval queue at full size">
            <Image src={approvalQueue} alt="Illustrative host knowledge-update queue with drafts awaiting review" sizes="(max-width: 640px) 100vw, 800px" className={pageStyles.image} />
          </a>
          <figcaption>Illustrative host-side approval queue: an AI-drafted knowledge change is reviewed before guests see it.</figcaption>
        </figure>

        <h2>Payments, rights, and incidents</h2>
        <p>
          Stripe handles payment card data; Moche-AI does not store the card number. Hosts can
          consult the <Link href="/legal/privacy">Privacy Policy</Link> and <Link href="/legal/dpa">DPA</Link>
          for data rights and retention, including records that may need to remain for legal or
          accounting reasons after an account closes.
        </p>
        <p>
          The DPA commits Moche-AI, as a processor, to notify an affected customer-controller
          without undue delay and within 72 hours of becoming aware of a personal-data breach
          affecting that customer&apos;s data. That is a commitment to the controller, not a promise
          that every guest is notified directly within 72 hours.
        </p>

        <h2>What we do not claim</h2>
        <p>
          Moche-AI does not currently hold SOC 2, ISO 27001, or a comparable third-party
          certification. Controls modeled on those frameworks are not independent attestation.
          We do not claim that AI answers can never be wrong, or that the portal is an emergency
          response service. Read the <Link href="/legal/security">Security Overview</Link> for the
          current assurance status rather than relying on a logo or a vague guarantee.
        </p>
        <p>
          If you discover a vulnerability, report it privately through <Link href="/support">support</Link>
          with the affected area and steps to reproduce. Please do not test against another host&apos;s
          property or a live guest stay.
        </p>
        <p className={pageStyles.reviewed}>Last reviewed September 2026.</p>
        <div className={pageStyles.endMatter}><Related current="/security" /></div>
      </article>
    </>
  );
}
