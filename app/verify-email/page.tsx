import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function VerifyEmailPage() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Logo />
        </div>
        <div className="card" style={{ padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>Check your inbox</h1>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            We sent you a verification link. Click it to activate your account, then sign in.
          </p>
          <Link href="/login" className="btn btn-primary">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
