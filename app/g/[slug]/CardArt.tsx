'use client';

import type { ReactNode } from 'react';

// Brand card art for the guest portal. Every card (main menu, assistant cards)
// renders the same frame — a brand-gradient tile with a single line glyph — so
// the page stays calm and consistent instead of a collage of unrelated images.
// Glyphs are custom stroke drawings (24x24, round caps), tinted by the
// portal's --gp-icon variable so they stay legible in dark AND light themes.

const GLYPHS: Record<string, ReactNode> = {
  // Concierge bell — the brand's service mark. Also the portal's send icon.
  host: (
    <>
      <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0" />
      <path d="M3.5 16.5h17" />
      <path d="M12 8.4v1.1" />
      <circle cx="12" cy="7.2" r="1.1" />
    </>
  ),
  ask: (
    <>
      <path d="M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H9.2L4.8 19.6a.4.4 0 0 1-.8-.3V6.5Z" />
      <path d="M9.7 9.3a2.35 2.35 0 0 1 2.3-1.8 2.3 2.3 0 0 1 2.35 2.2c0 1.5-2.05 1.85-2.35 3.1" />
      <circle cx="12" cy="15.4" r="0.2" fill="currentColor" />
    </>
  ),
  maintenance: (
    <path d="M14.6 6.4a4.1 4.1 0 0 0-5.5 5L4 16.5a2.05 2.05 0 1 0 2.9 2.9l5.1-5.1a4.1 4.1 0 0 0 5-5.5l-2.5 2.5-2.2-2.2 2.3-2.7Z" />
  ),
  extras: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9" rx="1.6" />
      <path d="M3.8 7.6h16.4v2.9H3.8z" />
      <path d="M12 7.6v11.9" />
      <path d="M12 7.6s-3.6.3-3.6-1.9A1.85 1.85 0 0 1 12 5.2a1.85 1.85 0 0 1 3.6.5c0 2.2-3.6 1.9-3.6 1.9Z" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9.6a13.5 13.5 0 0 1 18 0" />
      <path d="M6.4 13a9.6 9.6 0 0 1 11.2 0" />
      <path d="M9.9 16.3a5.4 5.4 0 0 1 4.2 0" />
      <circle cx="12" cy="19.2" r="0.4" fill="currentColor" />
    </>
  ),
  checkin: (
    <>
      <circle cx="8" cy="12" r="3.4" />
      <path d="M11.4 12H20" />
      <path d="M16.8 12v3" />
      <path d="M20 12v2.2" />
    </>
  ),
  checkout: (
    <>
      <rect x="4" y="3.6" width="10" height="16.8" rx="1.6" />
      <circle cx="11.3" cy="12" r="0.5" fill="currentColor" />
      <path d="M14.5 12H20" />
      <path d="m17.6 9.6 2.4 2.4-2.4 2.4" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M10 16.6V7.4h3.1a2.95 2.95 0 0 1 0 5.9H10" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="m7 7 .8 11.1A1.9 1.9 0 0 0 9.7 20h4.6a1.9 1.9 0 0 0 1.9-1.9L17 7" />
      <path d="M10.2 10.5v6" />
      <path d="M13.8 10.5v6" />
    </>
  ),
  local: (
    <>
      <path d="M12 21s-6.6-5.5-6.6-10.3A6.6 6.6 0 0 1 12 4.5a6.6 6.6 0 0 1 6.6 6.2C18.6 15.5 12 21 12 21Z" />
      <circle cx="12" cy="10.7" r="2.3" />
    </>
  ),
  house_rules: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6" />
      <path d="M9 12.5h6" />
      <path d="M9 16h3.6" />
    </>
  ),
  appliances: (
    <>
      <rect x="4" y="9" width="16" height="8" rx="2.4" />
      <path d="M8 9V7.4A1.4 1.4 0 0 1 9.4 6h5.2A1.4 1.4 0 0 1 16 7.4V9" />
      <path d="M9.5 12.6h5" />
      <path d="M7 17v1.6" />
      <path d="M17 17v1.6" />
      <path d="M20 11.5h1.4" />
    </>
  ),
  default: (
    <path d="m12 4 1.8 4.6 4.7 1.4-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.4L12 4Z" />
  ),
};

export function CardArt({ cardKey, size = 30 }: { cardKey: string; size?: number }) {
  return (
    <span className="gp-card-art" aria-hidden>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[cardKey] ?? GLYPHS.default}
      </svg>
    </span>
  );
}
