/* The <img> is Product Hunt's hosted badge widget; next/image adds nothing
   here (external SVG, no optimization benefit) and would require a
   next.config images.remotePatterns entry. eslint-disable is intentional. */
/* eslint-disable @next/next/no-img-element */

const PRODUCT_HUNT_URL =
  'https://www.producthunt.com/products/moche-ai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-moche-ai';

const BADGE_SRC =
  'https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1253642&theme=light&t=1789676021937';

// Official Product Hunt "featured" embed. Lives in the landing footer so it
// appears on the homepage and every /(marketing) page without per-page edits.
export function ProductHuntBadge() {
  return (
    <a
      href={PRODUCT_HUNT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Moche-AI on Product Hunt"
      style={{ display: 'inline-block', marginTop: '1rem' }}
    >
      <img
        src={BADGE_SRC}
        alt="Moche-Ai - AI Guest operations for five-star short-term rental stays | Product Hunt"
        width="250"
        height="54"
        loading="lazy"
      />
    </a>
  );
}
