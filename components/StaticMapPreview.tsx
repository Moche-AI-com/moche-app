'use client';

import { useState } from 'react';
import { MapPin, MapPinned, ImageOff } from 'lucide-react';
import { staticMapUrl, staticMapWithMarkersUrl, type MapMarker } from '@/lib/local/static-map';

interface Props {
  // Primary pin (the property).
  lat: number | null | undefined;
  lng: number | null | undefined;
  // Optional secondary pins (nearby places). When present the map auto-fits.
  markers?: MapMarker[];
  height?: number;
  width?: number;
  zoom?: number;
  caption?: string;
  className?: string;
  // Shown when there are no coordinates yet.
  emptyHint?: string;
}

// Shared, dependency-free map preview. Renders a Mapbox Static Images tile as a
// plain <img> — no Mapbox GL JS bundle, no client-side map runtime, so it costs
// nothing on load time and degrades to a hint card when unavailable.
export default function StaticMapPreview({
  lat,
  lng,
  markers,
  height = 200,
  width = 900,
  zoom = 14,
  caption,
  className,
  emptyHint = 'Pick an address to see it on the map.',
}: Props) {
  const [failed, setFailed] = useState(false);

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng);

  const src = !hasCoords
    ? null
    : markers && markers.length > 0
      ? staticMapWithMarkersUrl({ center: { lat, lng }, markers, width, height })
      : staticMapUrl({ lat, lng, zoom, width, height });

  if (!hasCoords || !src || failed) {
    return (
      <div
        className={className}
        style={{
          height,
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-strong)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--text-faint)',
          fontSize: 13,
          padding: 16,
          textAlign: 'center',
        }}
      >
        {failed ? <ImageOff size={16} aria-hidden /> : <MapPin size={16} aria-hidden />}
        <span>{failed ? 'Map preview unavailable right now.' : emptyHint}</span>
      </div>
    );
  }

  return (
    <figure className={className} style={{ margin: 0 }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          height,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? 'Map showing the property location'}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      {caption ? (
        <figcaption
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <MapPinned size={13} aria-hidden />
          <span>{caption}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
