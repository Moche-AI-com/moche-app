'use client';

// Interactive map for the Local page (2026-08-28). Hosts asked to find, favorite,
// and manage places from the map itself; the static preview couldn't do that.
//
// Two deliberate constraints:
//   1. Mapbox GL JS loads from the Mapbox CDN at runtime, NOT from npm. CI installs
//      with `npm ci`, and a package.json entry without a regenerated lockfile breaks
//      every job — the CDN path keeps the diff free of dependency surgery. The CSP in
//      next.config.mjs carries the Mapbox origins. The token is NEXT_PUBLIC_MAPBOX_TOKEN,
//      the domain-restricted public key (never the server-side MAPBOX_ACCESS_TOKEN).
//   2. It degrades, never breaks: no public token or a failed script load renders the
//      existing StaticMapPreview instead, with the same pins.
//
// Pins: the property in teal, host picks in coral, everything else in iris — the same
// color language the static pins used. Clicking a pin scrolls to and outlines the
// place's card in the manager below; editing stays in the card, never in the map.

import { useEffect, useMemo, useRef, useState } from 'react';
import StaticMapPreview from '@/components/StaticMapPreview';
import { mapboxPublicToken } from '@/lib/local/static-map';
import type { LocalPlaceRow } from '@/lib/local/canonical';

// Minimal structural types for the CDN build — enough for typecheck without
// @types/mapbox-gl (which the CDN approach deliberately avoids installing).
interface MapboxMap {
  on(event: 'load', cb: () => void): void;
  addControl(control: unknown): void;
  fitBounds(bounds: [[number, number], [number, number]], opts?: { padding?: number; maxZoom?: number }): void;
  resize(): void;
  remove(): void;
}
interface MapboxMarker {
  setLngLat(lngLat: [number, number]): this;
  setPopup(popup: MapboxPopup): this;
  addTo(map: MapboxMap): this;
  getElement(): HTMLElement;
  remove(): void;
}
interface MapboxPopup {
  setLngLat(lngLat: [number, number]): this;
  setHTML(html: string): this;
}
interface MapboxGLStatic {
  accessToken: string;
  Map: new (opts: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl?: boolean;
  }) => MapboxMap;
  Marker: new (opts?: { color?: string }) => MapboxMarker;
  Popup: new (opts?: { offset?: number; closeButton?: boolean }) => MapboxPopup;
  NavigationControl: new (opts?: { showCompass?: boolean }) => unknown;
}

declare global {
  interface Window {
    mapboxgl?: MapboxGLStatic;
  }
}

const MAPBOX_GL_VERSION = 'v3.8.0';
const STYLE = 'mapbox://styles/mapbox/streets-v12';

// One shared loader promise: the script tag is a singleton no matter how many maps
// mount. Resolves null on a load failure so every caller degrades the same way.
let mapboxReady: Promise<MapboxGLStatic | null> | null = null;
function loadMapboxGl(): Promise<MapboxGLStatic | null> {
  if (mapboxReady) return mapboxReady;
  mapboxReady = new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    if (window.mapboxgl) return resolve(window.mapboxgl);
    if (!document.getElementById('mapbox-gl-css')) {
      const link = document.createElement('link');
      link.id = 'mapbox-gl-css';
      link.rel = 'stylesheet';
      link.href = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.css`;
      document.head.appendChild(link);
    }
    const existing = document.getElementById('mapbox-gl-js') as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = 'mapbox-gl-js';
      script.src = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.js`;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', () => resolve(window.mapboxgl ?? null));
    script.addEventListener('error', () => resolve(null));
  });
  return mapboxReady;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Scroll to + outline the place's card in the manager. A static outline, not an
// animation — nothing here needs motion to be legible, and reduced-motion users get
// the identical signal.
function focusPlaceCard(recommendationId: string) {
  const el = document.getElementById(`place-${recommendationId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.outline = '2px solid var(--teal)';
  el.style.outlineOffset = '3px';
  window.setTimeout(() => {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }, 1800);
}

export function LocalMap({
  center,
  places,
  height = 340,
}: {
  center: { lat: number; lng: number };
  places: LocalPlaceRow[];
  height?: number;
}) {
  const token = mapboxPublicToken();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  // Only places with coordinates can be pins; a manual entry without a geocoded
  // address simply doesn't appear (it's still in the list below).
  const mappable = useMemo(
    () => places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [places],
  );
  // Re-init only when the pin set actually changes, not on every render.
  const pinsKey = mappable.map((p) => p.recommendationId).join(',');

  useEffect(() => {
    if (!token || !containerRef.current) return;
    let disposed = false;
    let map: MapboxMap | null = null;
    const markers: MapboxMarker[] = [];

    void loadMapboxGl().then((mapboxgl) => {
      if (!mapboxgl) {
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed || !containerRef.current) return;

      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [center.lng, center.lat],
        zoom: 12,
        attributionControl: true,
      });

      map.on('load', () => {
        if (disposed || !map) return;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

        const propertyPin = new mapboxgl.Marker({ color: '#0f766e' });
        propertyPin.setLngLat([center.lng, center.lat]).addTo(map);
        markers.push(propertyPin);

        for (const place of mappable) {
          const marker = new mapboxgl.Marker({ color: place.isFavorite ? '#f97362' : '#6366f1' });
          marker.setLngLat([place.lng as number, place.lat as number]);
          // Place names are host/provider data — escape before they become popup HTML.
          const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
            `<strong>${escapeHtml(place.name)}</strong>` +
              (place.hostNote ? `<div style="margin-top:4px;font-size:12px">${escapeHtml(place.hostNote)}</div>` : ''),
          );
          marker.setPopup(popup);
          const el = marker.getElement();
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => focusPlaceCard(place.recommendationId));
          marker.addTo(map);
          markers.push(marker);
        }

        if (mappable.length > 0) {
          const lngs = [center.lng, ...mappable.map((p) => p.lng as number)];
          const lats = [center.lat, ...mappable.map((p) => p.lat as number)];
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 56, maxZoom: 13 },
          );
        }
      });
    });

    return () => {
      disposed = true;
      for (const m of markers) m.remove();
      map?.remove();
    };
    // center + token are stable for the page's lifetime; pinsKey captures list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pinsKey]);

  if (!token || failed) {
    // Same pins, static render: the host loses interactivity, never the map.
    return (
      <StaticMapPreview
        lat={center.lat}
        lng={center.lng}
        markers={mappable.slice(0, 18).map((p) => ({
          lat: p.lat as number,
          lng: p.lng as number,
          color: p.isFavorite ? 'f97362' : '6366f1',
        }))}
        height={height}
        caption="Your property (teal) and its places — picks in coral."
      />
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }} data-testid="local-map-card">
      <div
        ref={containerRef}
        role="region"
        aria-label="Interactive map of this property's places"
        style={{ height, width: '100%' }}
        data-testid="local-map"
      />
      <p className="faint" style={{ margin: 0, padding: '.5rem .9rem', fontSize: '.75rem', borderTop: '1px solid var(--border)' }}>
        Click a pin to jump to its card below — your picks are coral, the property is teal.
      </p>
    </div>
  );
}
