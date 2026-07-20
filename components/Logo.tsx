import Link from 'next/link';

/**
 * Moche.AI dome / igloo mark — single source of truth.
 *
 * Design: one clean dome silhouette with a clear arched doorway (welcome / access)
 * and a single soft "intelligence" spark above the entrance. No brick clutter,
 * no snowflake lines, no antenna. Legible at 16/24/32px.
 *
 * variant:
 *  - 'gradient' (default): teal→iris gradient fill, subtle glow. For dark UI.
 *  - 'mono': uses currentColor so it inherits text color (favicons, print, footers).
 */
export function DomeMark({
  size = 38,
  variant = 'gradient',
}: {
  size?: number;
  variant?: 'gradient' | 'mono';
}) {
  const gid = 'mocheDomeGrad';
  const stroke = variant === 'mono' ? 'currentColor' : `url(#${gid})`;
  const spark = variant === 'mono' ? 'currentColor' : '#FF8A5C';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        filter: variant === 'gradient' ? 'drop-shadow(0 0 8px var(--glow-teal, rgba(51,230,212,.35)))' : 'none',
      }}
    >
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size} role="img">
        <defs>
          <linearGradient id={gid} x1="8" y1="10" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#33E6D4" />
            <stop offset="1" stopColor="#7C8CFF" />
          </linearGradient>
        </defs>
        {/* dome silhouette */}
        <path
          d="M6 37V24a18 18 0 0 1 36 0v13"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* ground line */}
        <path d="M5 37h38" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        {/* arched doorway (entrance) */}
        <path
          d="M19 37V29a5 5 0 0 1 10 0v8"
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* intelligence spark above the entrance */}
        <circle cx="24" cy="17.5" r="2.4" fill={spark} />
      </svg>
    </span>
  );
}

export function Logo({
  href = '/',
  size = 38,
  variant = 'gradient',
}: {
  href?: string;
  size?: number;
  variant?: 'gradient' | 'mono';
}) {
  return (
    <Link
      href={href}
      className="brand"
      aria-label="Moche.AI home"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.6rem',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: '1.3rem',
        letterSpacing: '-.02em',
      }}
    >
      <DomeMark size={size} variant={variant} />
      <span>
        Moche<span className="gradient-text">.AI</span>
      </span>
    </Link>
  );
}
