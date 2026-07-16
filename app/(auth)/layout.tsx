import { Logo } from '@/components/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem 1rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Logo href="/" />
        </div>
        <div className="card" style={{ padding: '2rem' }}>{children}</div>
      </div>
    </main>
  );
}
