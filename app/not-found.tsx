import Link from 'next/link';
import { DomeMark } from '@/components/Logo';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <DomeMark size={56} />
        </div>
        <h1 style={{ fontSize: '2.4rem', marginBottom: '.35rem' }}>404</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          This page has checked out. The link may be old or the page may have moved.
        </p>
        <Link href="/" className="btn btn-primary">Back to home</Link>
      </div>
    </div>
  );
}
