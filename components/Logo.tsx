import Link from 'next/link';

/**
 * Moche.AI bell-igloo mark — single source of truth.
 *
 * Design: an igloo/dome built from nested concentric arcs with an arched entrance,
 * topped by a coral "push-to-ring" service-bell button on a short stem — the igloo
 * doubles as a concierge service bell. Legible at 16/24/32px.
 *
 * variant:
 *  - 'gradient' (default): teal→iris gradient stroke, subtle glow. For dark UI.
 *  - 'mono': uses currentColor so it inherits text color (favicons, print, footers).
 */
export function DomeMark({
  size = 38,
  variant = 'gradient',
}: {
  size?: number;
  variant?: 'gradient' | 'mono';
}) {
  const gid = 'mocheBrandGrad';
  const stroke = variant === 'mono' ? 'currentColor' : `url(#${gid})`;
  const bell = variant === 'mono' ? 'currentColor' : '#FF8A5C';
  const dome = variant === 'mono' ? 'currentColor' : '#33E6D4';
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
          <linearGradient id={gid} x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#33E6D4" />
            <stop offset="1" stopColor="#7C8CFF" />
          </linearGradient>
        </defs>
        {/* ground line */}
        <path d="M5 34h38" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        {/* outer igloo dome */}
        <path d="M8 34a16 16 0 0 1 32 0" stroke={stroke} strokeWidth="2.4" fill="none" />
        {/* nested igloo arcs */}
        <path d="M13 34a11 11 0 0 1 22 0" stroke={stroke} strokeWidth="1.7" opacity="0.7" fill="none" />
        <path d="M18.5 34a5.5 5.5 0 0 1 11 0" stroke={stroke} strokeWidth="1.7" opacity="0.55" fill="none" />
        {/* arched entrance */}
        <path d="M20.5 34v-4.2a3.5 3.5 0 0 1 7 0V34" fill={dome} opacity="0.9" />
        {/* push-to-ring service-bell button on a stem */}
        <circle cx="24" cy="12" r="2.4" fill={bell} />
        <path d="M24 12v-4" stroke={bell} strokeWidth="1.6" strokeLinecap="round" />
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
