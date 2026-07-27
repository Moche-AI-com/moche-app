// Client-safe Mapbox Static Images helpers.
//
// These build image URLs only — they use NEXT_PUBLIC_MAPBOX_TOKEN, which is a
// deliberately separate PUBLIC token restricted to our own domains in the
// Mapbox console (moche-ai.com, www.moche-ai.com, localhost:3000). The
// server-side token (MAPBOX_ACCESS_TOKEN) is never exposed here.
//
// Returns null when no public token is configured so callers can simply skip
// rendering a map instead of showing a broken image.

const STATIC_BASE = 'https://api.mapbox.com/styles/v1';
const DEFAULT_STYLE = 'mapbox/streets-v12';

export interface MapMarker {
  lat: number;
  lng: number;
  // Hex without '#'. Defaults to the Moche teal.
  color?: string;
  // Single letter/number or a Maki icon name.
  label?: string;
  small?: boolean;
}

export function mapboxPublicToken(): string | null {
  const t = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  return t ? t : null;
}

export function hasStaticMaps(): boolean {
  return mapboxPublicToken() !== null;
}

function clampLat(v: number): number {
  return Math.max(-85, Math.min(85, v));
}

function marker(m: MapMarker): string {
  const pin = m.small ? 'pin-s' : 'pin-l';
  const color = (m.color ?? '14b8a6').replace('#', '');
  const label = m.label ? `-${encodeURIComponent(m.label)}` : '';
  return `${pin}${label}+${color}(${m.lng.toFixed(5)},${clampLat(m.lat).toFixed(5)})`;
}

// Static map centred on a single pin.
export function staticMapUrl(opts: {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
  retina?: boolean;
  style?: string;
  markerColor?: string;
}): string | null {
  const token = mapboxPublicToken();
  if (!token) return null;
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return null;

  const w = Math.min(Math.max(Math.round(opts.width ?? 640), 64), 1280);
  const h = Math.min(Math.max(Math.round(opts.height ?? 240), 64), 1280);
  const zoom = Math.min(Math.max(opts.zoom ?? 14, 0), 20);
  const overlay = marker({ lat: opts.lat, lng: opts.lng, color: opts.markerColor });
  const size = `${w}x${h}${opts.retina === false ? '' : '@2x'}`;
  const style = opts.style ?? DEFAULT_STYLE;

  return `${STATIC_BASE}/${style}/static/${overlay}/${opts.lng.toFixed(5)},${clampLat(opts.lat).toFixed(5)},${zoom}/${size}?access_token=${encodeURIComponent(token)}&attribution=true&logo=true`;
}

// Static map with several pins, auto-fitted to their bounding box.
// Mapbox caps the URL length, so we cap the pin count.
export function staticMapWithMarkersUrl(opts: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  width?: number;
  height?: number;
  maxMarkers?: number;
  style?: string;
  padding?: number;
}): string | null {
  const token = mapboxPublicToken();
  if (!token) return null;

  const max = Math.min(opts.maxMarkers ?? 18, 24);
  const pins = opts.markers
    .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
    .slice(0, max);

  const w = Math.min(Math.max(Math.round(opts.width ?? 900), 64), 1280);
  const h = Math.min(Math.max(Math.round(opts.height ?? 320), 64), 1280);
  const style = opts.style ?? DEFAULT_STYLE;
  const size = `${w}x${h}@2x`;

  // Property pin first (large, teal) then the places (small, iris).
  const overlays = [
    marker({ lat: opts.center.lat, lng: opts.center.lng, color: '0f766e' }),
    ...pins.map((m) => marker({ ...m, small: true, color: m.color ?? '6366f1' })),
  ].join(',');

  if (pins.length === 0) {
    return staticMapUrl({ lat: opts.center.lat, lng: opts.center.lng, width: w, height: h, style });
  }

  const lats = [opts.center.lat, ...pins.map((m) => m.lat)];
  const lngs = [opts.center.lng, ...pins.map((m) => m.lng)];
  const pad = opts.padding ?? 0.004;
  const bbox = [
    (Math.min(...lngs) - pad).toFixed(5),
    clampLat(Math.min(...lats) - pad).toFixed(5),
    (Math.max(...lngs) + pad).toFixed(5),
    clampLat(Math.max(...lats) + pad).toFixed(5),
  ].join(',');

  return `${STATIC_BASE}/${style}/static/${overlays}/[${bbox}]/${size}?access_token=${encodeURIComponent(token)}&attribution=true&logo=true`;
}

// Link out to a full interactive map / directions in the guest's own map app.
export function directionsUrl(lat: number, lng: number, label?: string): string {
  const q = label ? `${encodeURIComponent(label)}` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
}
