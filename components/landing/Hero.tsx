import Link from 'next/link';
import Image from 'next/image';
import portal from '@/public/landing/moche-guest-portal-cape-house.webp';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Product-led hero. The previous version fanned seven stock property photos
// above the copy, which showed a visitor what a rental looks like -- something
// they already know -- and nothing about what Moche actually does. That fan is
// replaced with the real guest portal, so the first thing cold traffic sees is
// the product surface a guest gets.
//
// Two columns on desktop, copy first and stacked on mobile. The screenshot is
// server-rendered, `priority`, and never lazy-loaded: it is the LCP element.
//
// Copy carries the positioning shift from "run every property from one
// workspace" (a workspace claim) to property-aware guest support built from
// host-approved information (a behaviour claim we can actually stand behind).
//
// CTAs are unchanged on purpose. /demo/cape-house does not exist in this repo,
// so swapping the primary CTA to "See Moche in action" would ship a broken
// link; the working trial CTA and the demo mailto stay exactly as they were.
const TRUST = [
  'Built from your property information',
  'Host-controlled',
  'Escalates instead of guessing',
] as const;

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.heroLayout}`}>
        <div className={styles.heroCopy}>
          <Reveal as="p" eager className={styles.heroKicker}>
            Property-aware guest support for short-term rentals
          </Reveal>
          <Reveal as="h1" eager delay={60} className={styles.heroTitle}>
            Your guests get property-aware answers. You get your evenings back.
          </Reveal>
          <Reveal as="p" eager delay={130} className={styles.heroSubtitle}>
            Moche helps guests find answers from the property information you approve, then routes
            questions to you when an answer is missing, restricted, or unclear.
          </Reveal>
          <Reveal eager delay={200} className={styles.heroActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start free trial
            </Link>
            <a
              href="mailto:hostspark.org@gmail.com?subject=Request%20a%20demo&body=Hi%20Moche-AI%20team%2C%0A%0AI%27d%20like%20to%20see%20a%20demo.%20Here%27s%20a%20bit%20about%20my%20properties%3A%0A%0A"
              className="btn btn-ghost btn-lg"
            >
              Request a demo
            </a>
          </Reveal>
          <Reveal as="ul" eager delay={260} className={styles.heroTrust}>
            {TRUST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </Reveal>
          <Reveal as="p" eager delay={310} className={styles.heroTrialNote}>
            One month free on the top tier, up to 5 properties. Card required, cancel anytime.
          </Reveal>
        </div>

        <div className={styles.heroMedia}>
          <Image
            src={portal}
            alt="The Moche guest portal for a property called Cape house, showing a concierge greeting and cards for the stay, the home, food and drink, exploring nearby, host recommendations, reporting an issue, and messaging the host."
            width={724}
            height={915}
            sizes="(min-width: 960px) 42vw, 92vw"
            className={styles.heroShot}
            priority
          />
        </div>
      </div>
    </section>
  );
}
