import { DomeMark } from '@/components/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem 1rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <a
            href="/?view=landing"
            className="brand"
            aria-label="Moche-AI home"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.3rem', letterSpacing: '-.02em', minHeight: 44, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <DomeMark />
            <span>Moche-<span className="gradient-text">AI</span></span>
          </a>
        </div>
        <div className="card" style={{ padding: '2rem' }}>{children}</div>
      </div>
    </main>
  );
}
