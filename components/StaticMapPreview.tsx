'use client';

import { useEffect, useState } from 'react';
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
  const [loaded, setLoaded] = useState(false);
  const [srcKey, setSrcKey] = useState<string | null>(null);

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng);

  const src = !hasCoords
    ? null
    : markers && markers.length > 0
      ? staticMapWithMarkersUrl({ center: { lat, lng }, markers, width, height })
      : staticMapUrl({ lat, lng, zoom, width, height });

  // A new URL (filter change, new address) means a new tile to wait for.
  useEffect(() => {
    if (src !== srcKey) {
      setSrcKey(src);
      setLoaded(false);
      setFailed(false);
    }
  }, [src, srcKey]);

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
        {/* Placeholder while the tile is in flight, so the area never flashes as
            an empty dark block on slower connections. */}
        {!loaded && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'var(--surface-2)',
              color: 'var(--text-faint)',
              fontSize: 12,
            }}
          >
            <MapPin size={15} />
            <span>Loading map…</span>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? 'Map showing the property location'}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          // Cached images can finish loading before React attaches onLoad; this
          // catches that case so the placeholder never sticks.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity var(--tr, .2s) var(--ease-out, ease)',
          }}
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
