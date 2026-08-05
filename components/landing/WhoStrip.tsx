import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Who it serves + what it sits alongside, in one band.
//
// An earlier version of the page had these as two separate full sections (a
// marquee of host types, then a compatibility strip with a heading, a logo row
// and a two-sentence note). That is two screens of scrolling to say two short
// things, which is exactly the clogging this page has been pulling out. Merged
// into a single slim band that reads in about four seconds.
//
// The band sits directly under the hero on purpose: the two questions a host
// has after reading the headline are "is this for someone like me" and "does it
// work with where I list", and this answers both before asking them to read a
// benefit.
const SERVES = [
  'Solo hosts',
  'Superhosts',
  'Co-hosts',
  'Boutique portfolios',
  'Cabin operators',
  'Beach villas',
  'Ski chalets',
  'Urban condos',
  'Glamping sites',
  'Property managers',
] as const;

// Named as places a booking can come from, never as partners or integrations:
// there is no relationship with any of them, and the product is deliberately
// platform-agnostic. The trademark line below is the same position taken in
// THIRD_PARTY_LICENSES.md and /legal/open-source.
const PLATFORMS = ['Airbnb', 'Vrbo', 'Booking.com', 'Hostfully', 'Hospitable', 'Direct'] as const;

export function WhoStrip() {
  return (
    <section className={styles.who} aria-labelledby="who-heading">
      <div className="wrap">
        <h2 id="who-heading" className={styles.srOnly}>
          Who Moche-AI is for, and the platforms it works alongside
        </h2>

        <Reveal as="p" className={styles.whoLabel}>
          Built for
        </Reveal>

        {/* The moving track is decorative and duplicated for the seamless loop,
            so it is hidden from assistive tech and the real list is exposed
            below it as visually hidden text. Otherwise a screen reader hears
            every host type twice. */}
        <div className={styles.marquee} aria-hidden>
          <div className={styles.marqueeTrack}>
            {[0, 1].map((copy) => (
              <ul key={copy} className={styles.marqueeGroup}>
                {SERVES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <ul className={styles.srOnly}>
          {SERVES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <Reveal delay={80} className={styles.compat}>
          <p className={styles.compatLabel}>Works alongside</p>
          <ul className={styles.compatLogos}>
            {PLATFORMS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className={styles.compatNote}>
            No integration, no guest login, no lock-in. Names are trademarks of their owners.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
