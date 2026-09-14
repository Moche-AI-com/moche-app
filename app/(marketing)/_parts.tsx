import Link from 'next/link';
import Image, { type StaticImageData } from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { articleCoverFor } from '@/lib/marketing/article-covers';
import { MARKETING_ROUTES } from '@/lib/marketing/hero-links';
import styles from './marketing.module.css';

/**
 * Blocks shared by every page in this route group. Kept here rather than in
 * /components because they are coupled to marketing.module.css and to
 * MARKETING_ROUTES, and nothing outside this group should render them.
 *
 * Only `page.tsx` and `route.ts` are routable in the app router, so this file
 * sitting next to the pages does not create a URL.
 */

/** Page header: eyebrow, H1, lede, optional review date. */
export function DocHeader({
  eyebrow,
  title,
  lede,
  updated,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  /** Human-readable review date. Omitted on pages with no time-sensitive claims. */
  updated?: string;
}) {
  return (
    <>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lede}>{lede}</p>
      {updated ? <p className={styles.meta}>Last reviewed {updated}</p> : null}
    </>
  );
}

/**
 * Page-opening image, one per page, directly under the lede.
 *
 * The picture at the top of an article is an editorial cover, not a product
 * screenshot. The registry maps the product capture each page previously passed
 * to the correct vacation-rental photograph, so article covers, homepage arc
 * cards, and Related-card thumbnails all show the same place. Product captures
 * stay with ArticleFigure, where the surrounding text is actually describing
 * the interface being shown.
 *
 * `alt` is required at the call site and remains the fallback for a capture not
 * in the cover registry. Registered editorial photographs provide their own
 * descriptive alt and caption. Empty alt would be wrong even though it is
 * correct for the hero fan, where the adjacent label is already the link name.
 */
export function PageHero({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: StaticImageData;
  alt: string;
  /** Optional line under the image. Skip it rather than restating the alt text. */
  caption?: string;
  /** Set on the above-the-fold image so it is not lazy-loaded into a layout shift. */
  priority?: boolean;
}) {
  const editorialCover = articleCoverFor(src);

  return (
    <figure className={`${styles.hero} ${styles.wide}`}>
      <div className={styles.heroFrame}>
        <Image
          src={editorialCover?.src ?? src}
          alt={editorialCover?.alt ?? alt}
          fill
          priority={priority}
          sizes="(max-width: 1040px) 100vw, 1040px"
          placeholder="blur"
        />
      </div>
      {(editorialCover?.caption ?? caption) ? (
        <figcaption className={styles.heroCaption}>{editorialCover?.caption ?? caption}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Inline figure inside the article body: the product, at the moment the text
 * is describing it.
 *
 * Distinct from PageHero on purpose: the hero opens the page and answers "what
 * is this about", the inline figure sits inside a section and answers "show
 * me". One per article section that names a real surface — the image must be
 * the thing the surrounding paragraphs describe, not decoration between them.
 *
 * Same 16:9 frame and caption treatment as the hero so the two read as one
 * visual language; no `priority` because an inline figure is below the fold by
 * definition and should lazy-load.
 */
export function ArticleFigure({
  src,
  alt,
  caption,
}: {
  src: StaticImageData;
  /** Required: the figure illustrates a specific surface, and a screen reader
      needs to know which one. */
  alt: string;
  /** The tie back to the text — name the surface and why it is here. */
  caption?: string;
}) {
  return (
    <figure className={`${styles.hero} ${styles.wide}`}>
      <div className={styles.heroFrame}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 1040px) 100vw, 1040px"
          placeholder="blur"
        />
      </div>
      {caption ? <figcaption className={styles.heroCaption}>{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * Grid of short cards for facts that are a set rather than a sequence.
 *
 * Sits at `.wide`, so three or four cards get real horizontal room instead of
 * stacking single-file inside the 68ch reading column. Use `steps` (in the page
 * markup) when order matters and this when it does not.
 */
export function CardGrid({
  items,
}: {
  items: readonly { title: string; body: string }[];
}) {
  return (
    <ul className={`${styles.cards} ${styles.wide}`}>
      {items.map((c) => (
        <li key={c.title}>
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cross-links to the other pages in this group, minus the current one.
 *
 * Every page renders this, which is what makes the six pages a linked cluster
 * instead of six dead ends. Passing `current` prevents a page linking to itself.
 *
 * It used to be a wrapped row of underlined two-word labels, which read as a
 * footnote: a visitor who finished the article had no reason to prefer "Support"
 * over "Trust and safety" and so chose neither. Each entry is now a card with the
 * destination's own photograph and its one-line description, both already defined
 * on HeroLink, so there is nothing to keep in sync by hand.
 */
export function Related({ current }: { current: string }) {
  const others = MARKETING_ROUTES.filter((r) => r.href !== current);

  return (
    <nav className={`${styles.related} ${styles.wide}`} aria-labelledby="related-heading">
      <p className={styles.relatedLabel} id="related-heading">
        More about Moche-AI
      </p>
      <ul className={styles.relatedList}>
        {others.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className={styles.relatedCard}>
              {/* alt="" because the card's heading is immediately adjacent and is
                  already the accessible name for this link. */}
              <span className={styles.relatedThumb}>
                <Image src={r.src} alt="" fill sizes="(max-width: 720px) 100vw, 340px" />
              </span>
              <span className={styles.relatedText}>
                <span className={styles.relatedName}>
                  {r.label}
                  <ArrowUpRight size={14} aria-hidden />
                </span>
                <span className={styles.relatedDesc}>{r.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The single conversion action on the page, at the end of the reading.
 *
 * One CTA per page and nothing above it with the same intent: a second "start
 * free" button mid-article competes with the reading rather than adding a
 * chance to convert.
 */
export function CtaBand({ text }: { text: string }) {
  return (
    <div className={`${styles.ctaBand} ${styles.wide}`}>
      <p className={styles.ctaBandText}>{text}</p>
      <Link href="/signup" className="btn btn-primary">
        Start free
        <ArrowRight size={16} aria-hidden style={{ marginLeft: '.4rem' }} />
      </Link>
    </div>
  );
}

/**
 * Numbered source list with real URLs.
 *
 * These pages exist to be trusted, and a page that cites "industry research"
 * without a link is worse than one that cites nothing: it makes every other
 * claim on the page look decorative too.
 */
export function Sources({ items }: { items: readonly { label: string; href: string }[] }) {
  return (
    <section className={styles.sources} aria-labelledby="sources-heading">
      <h2 id="sources-heading">Sources</h2>
      <ol>
        {items.map((s) => (
          <li key={s.href}>
            <a href={s.href} rel="nofollow noopener" target="_blank">
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
