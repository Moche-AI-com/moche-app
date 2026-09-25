import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './article-back.module.css';

export default function MarketingArticleTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className={styles.clearance} aria-hidden="true" />
      <Link href="/" className={styles.back} aria-label="Back to home page">
        <span aria-hidden="true">←</span> Back to home
      </Link>
    </>
  );
}
