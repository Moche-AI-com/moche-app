import Link from 'next/link';

// Moche.AI smart-dome / igloo mark (from the landing design system).
export function DomeMark({ size = 38 }: { size?: number }) {
  const gid = 'domeGrad';
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 0 10px var(--glow-teal))' }}
    >
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#33E6D4" />
            <stop offset="1" stopColor="#7C8CFF" />
          </linearGradient>
        </defs>
        <path d="M5 34h38" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 34a16 16 0 0 1 32 0" stroke={`url(#${gid})`} strokeWidth="2.4" fill="none" />
        <path d="M13 34a11 11 0 0 1 22 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.7" fill="none" />
        <path d="M18.5 34a5.5 5.5 0 0 1 11 0" stroke={`url(#${gid})`} strokeWidth="1.7" opacity="0.55" fill="none" />
        <path d="M24 18v16M15.5 26.5l3-2.2M32.5 26.5l-3-2.2" stroke={`url(#${gid})`} strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
        <path d="M20.5 34v-4.2a3.5 3.5 0 0 1 7 0V34" fill="#33E6D4" opacity="0.9" />
        <circle cx="24" cy="12" r="2.4" fill="#FF8A5C" />
        <path d="M24 12v-4" stroke="#FF8A5C" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ href = '/', size = 38 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="brand" aria-label="Moche.AI home" style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.3rem', letterSpacing: '-.02em' }}>
      <DomeMark size={size} />
      <span>
        Moche<span className="gradient-text">.AI</span>
      </span>
    </Link>
  );
}
