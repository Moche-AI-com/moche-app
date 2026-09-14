import Link from 'next/link';
import Image, { type StaticImageData } from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { articleCoverFor, articleH1ForEyebrow } from '@/lib/marketing/article-covers';
import { MARKETING_ROUTES } from '@/lib/marketing/hero-links';
import styles from './marketing.module.css';

/**
 * Blocks shared by every page in this route group. Kept here rather than in
 * /components because they are coupled to marketing.module.css and to
 * MARKETING_ROUTES, and nothing outside this group should render them.
 */

/**
 * Page header: eyebrow, H1, lede, optional review date.
 *
 * Registered articles resolve their H1 from the article registry so heading,
 * route, and opening image remain one presentation contract. Any new fallback
 * page simply uses the title supplied by its page file.
 */
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
  const articleH1 = articleH1ForEyebrow(eyebrow) ?? title;

  return (
    <>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1 className={styles.title}>{articleH1}</h1>
      <p className={styles.lede}>{lede}</p>
      {updated ? <p className={styles.meta}>Last reviewed {updated}</p> : null}
    </>
  );
}

/**
 * Page-opening image, one per page, directly under the lede.
 *
 * This is the topic-specific editorial cover, not the homepage gallery image.
 * The first image names the article's subject through recognizable symbols;
 * product captures stay with ArticleFigure, where surrounding text describes
 * the interface being shown. SVG covers are served without the optimizer and
 * supply their own accessibility text and caption.
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
  const imageSrc = editorialCover?.src ?? src;
  const isVectorArt = typeof imageSrc === 'string' && imageSrc.endsWith('.svg');
  const imageCaption = editorialCover?.caption ?? caption;

  return (
    <figure className={`${styles.hero} ${styles.wide}`}>
      <div className={styles.heroFrame}>
        <Image
          src={imageSrc}
          alt={editorialCover?.alt ?? alt}
          fill
          priority={priority}
          sizes="(max-width: 1040px) 100vw, 1040px"
          placeholder={isVectorArt ? 'empty' : 'blur'}
          unoptimized={isVectorArt}
        />
      </div>
      {imageCaption ? (
        <figcaption className={styles.heroCaption}>{imageCaption}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Inline figure inside the article body: the product, at the moment the text
 * is describing it.
 */
export function ArticleFigure({
  src,
  alt,
  caption,
}: {
  src: StaticImageData;
  /** Required: the figure illustrates a specific surface. */
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

/** Grid of short cards for facts that are a set rather than a sequence. */
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
 * Cross-links to the other pages in this group, minus the current one. Each
 * Related card keeps the polished rental photograph used in the landing arc;
 * the article's own illustration remains its opening image after the click.
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
              {/* alt="" because the card's heading is already the link name. */}
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

/** The single conversion action on the page, at the end of the reading. */
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

/** Numbered source list with real URLs. */
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
