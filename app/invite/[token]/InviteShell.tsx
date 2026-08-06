import { Logo } from '@/components/Logo';

/**
 * Page frame for the public invitation route.
 *
 * Deliberately mirrors app/(auth)/layout.tsx rather than inventing its own look:
 * an invitee lands here and then immediately continues into sign-in, so the two
 * screens should feel like the same product. This also replaced a bespoke
 * stylesheet that hardcoded dark surfaces and referenced tokens that do not
 * exist (`--muted`, `--faint`), which rendered near-invisible grey-on-cream text
 * in the app's default light theme.
 *
 * A plain server component with no styled-jsx: this shell is rendered from both
 * a server component (the unavailable states) and a client component (the
 * acceptance form), and styled-jsx is client-only.
 */
export function InviteShell({
  eyebrow,
  title,
  titleId,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1rem',
        background: 'var(--bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Logo href="/" />
        </div>
        <section className="card" aria-labelledby={titleId} style={{ padding: 'clamp(1.5rem, 5vw, 2.25rem)' }}>
          <p
            className="gradient-text"
            style={{
              fontSize: '.72rem',
              fontWeight: 700,
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              margin: '0 0 .5rem',
            }}
          >
            {eyebrow}
          </p>
          <h1 id={titleId} style={{ fontSize: 'clamp(1.5rem, 5vw, 1.9rem)', lineHeight: 1.15, margin: '0 0 1rem' }}>
            {title}
          </h1>
          {children}
        </section>
      </div>
    </main>
  );
}
