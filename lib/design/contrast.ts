// WCAG contrast maths (backlog P6-03).
//
// Kept as a pure module so the palette audit can run as a unit test rather than a
// one-off manual check. A token pair that regresses fails CI instead of shipping.

export interface Rgb { r: number; g: number; b: number }

/** Parses `#rgb`, `#rrggbb`, or `rgb(r,g,b)`. Throws on anything else. */
export function parseColor(value: string): Rgb {
  const v = value.trim();

  const hex = v.startsWith('#') ? v.slice(1) : null;
  if (hex && (hex.length === 3 || hex.length === 6)) {
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) throw new Error(`Unparseable color: ${value}`);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };

  throw new Error(`Unparseable color: ${value}`);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1. */
export function luminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === 'string' ? parseColor(color) : color;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two opaque colors, 1..21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Rounded to 2dp, which is how the audit table reports it. */
export function ratio(a: string, b: string): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
/** Minimum for UI component boundaries and graphical objects (WCAG 1.4.11). */
export const AA_NON_TEXT = 3;

export function meetsAA(a: string, b: string, level: number = AA_NORMAL): boolean {
  return contrastRatio(a, b) >= level;
}

/**
 * Flattens a translucent overlay onto an opaque backdrop, so tokens defined as
 * `rgba(...)` (borders, glass surfaces) can be audited against what a user
 * actually sees rather than being skipped.
 */
export function flatten(overlay: string, backdrop: string): Rgb {
  const o = parseColor(overlay);
  const b = parseColor(backdrop);
  const m = overlay.match(/^rgba?\([^)]*?,\s*([\d.]+)\s*\)$/i);
  const alpha = m ? Math.min(Math.max(Number(m[1]), 0), 1) : 1;
  return {
    r: o.r * alpha + b.r * (1 - alpha),
    g: o.g * alpha + b.g * (1 - alpha),
    b: o.b * alpha + b.b * (1 - alpha),
  };
}
