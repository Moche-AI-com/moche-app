import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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
 * Cross-links to the other pages in this group, minus the current one.
 *
 * Every page renders this, which is what makes the six pages a linked cluster
 * instead of six dead ends. Passing `current` prevents a page linking to itself.
 */
export function Related({ current }: { current: string }) {
  const others = MARKETING_ROUTES.filter((r) => r.href !== current);

  return (
    <nav className={styles.related} aria-labelledby="related-heading">
      <p className={styles.relatedLabel} id="related-heading">
        More about Moche-AI
      </p>
      <ul className={styles.relatedList}>
        {others.map((r) => (
          <li key={r.href}>
            <Link href={r.href}>{r.label}</Link>
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
    <div className={styles.ctaBand}>
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
