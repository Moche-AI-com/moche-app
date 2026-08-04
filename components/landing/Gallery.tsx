import Image from 'next/image';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';
import styles from './landing.module.css';

// Layout intent (>=768px): `tall` holds column one across the two upper rows,
// the two `default` cells stack beside it, and `wide` closes the composition as
// a full-width band on row three. Every grid cell is filled -- an earlier
// revision marked two photos `tall`, which left a ragged empty cell.
const PHOTOS = [
  { src: cottage, alt: 'A coastal cottage beneath white cliffs, near the water', span: 'tall' as const },
  { src: cabin, alt: 'Cozy cabin interior with sunlit plaid armchairs by a window', span: 'default' as const },
  { src: pool, alt: 'Modern rental home with a private pool and wood deck', span: 'default' as const },
  { src: handoff, alt: 'A host handing keys to an arriving guest', span: 'wide' as const },
] as const;

const SPAN_CLASS: Record<(typeof PHOTOS)[number]['span'], string> = {
  tall: styles.gallerySectionCellTall,
  wide: styles.gallerySectionCellWide,
  default: '',
};

// Asymmetric bento-style grid instead of a plain 3-up card row, per the
// project's anti-templated-layout guidance. Every cell is filled.
export function Gallery() {
  return (
    <section className={styles.gallerySection} id="gallery" aria-labelledby="gallery-heading">
      <div className="wrap">
        <h2 id="gallery-heading" className={styles.sectionHeading}>
          Every kind of stay, one workspace
        </h2>
        <div className={styles.gallerySectionGrid}>
          {PHOTOS.map((photo) => (
            <div
              key={photo.alt}
              className={`${styles.gallerySectionCell} ${SPAN_CLASS[photo.span]}`}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes={photo.span === 'wide' ? '100vw' : '(min-width: 768px) 50vw, 100vw'}
                className={styles.gallerySectionImage}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
