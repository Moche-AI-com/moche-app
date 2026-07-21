import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/guards';
import { Logo } from '@/components/Logo';

export default async function Home() {
  const user = await getUser();
  if (user) redirect('/dashboard');

  return (
    <main>
      <header className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72 }}>
        <Logo />
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </header>
      <section className="wrap" style={{ paddingTop: 'clamp(3rem,8vw,7rem)', paddingBottom: '4rem', maxWidth: 820 }}>
        <span className="badge badge-teal" style={{ marginBottom: '1.25rem' }}>Property Brain · Guest Concierge</span>
        <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4.5rem)', marginBottom: '1.25rem' }}>
          Your property&apos;s <span className="gradient-text">brain</span>.<br />Your guests&apos; first stop.
        </h1>
        <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 560, marginBottom: '2rem' }}>
          Each property gets an AI concierge trained on your own documents. Guests scan a QR code, ask in any
          language, and get instant, grounded answers — no app, no login, no PMS.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn btn-primary btn-lg">Create your host account</Link>
          <Link href="/login" className="btn btn-ghost btn-lg">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
