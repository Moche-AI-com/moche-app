import Image from 'next/image';
import poster from '@/public/premium/str-video-poster-kitchen.webp';
import styles from './landing.module.css';

// No video file exists yet. This renders an honest "coming soon" placeholder:
// correct 16:9 aspect box (so no layout shift once a real video lands), a real
// poster photo, and a disabled play affordance that is announced to
// assistive tech rather than pretending to be a working player.
export function DemoVideoSlot() {
  return (
    <section className={styles.demoVideoSection} aria-labelledby="demo-video-heading">
      <div className="wrap">
        <h2 id="demo-video-heading" className={styles.sectionHeading}>
          See it in action
        </h2>
        <div className={styles.demoVideoSectionFrame}>
          <Image
            src={poster}
            alt="Preview of the Moche-AI guest workspace, shown inside a modern rental kitchen"
            fill
            sizes="(min-width: 1024px) 900px, 100vw"
            className={styles.demoVideoSectionPoster}
            priority={false}
          />
          <div className={styles.demoVideoSectionOverlay}>
            <button
              type="button"
              className={styles.demoVideoSectionPlay}
              aria-label="Demo video coming soon"
              disabled
            >
              <PlayIcon />
            </button>
            <p className={styles.demoVideoSectionCaption}>Demo video coming soon</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5-13-7.5Z" fill="currentColor" />
    </svg>
  );
}
