'use client';

import { useEffect, useRef, useState } from 'react';
import StaticMapPreview from '@/components/StaticMapPreview';
import { mapboxPublicToken } from '@/lib/local/static-map';
import { validCoordinates } from '@/lib/local/validation';
import type { LocalPlaceRow } from '@/lib/local/canonical';
import type { LocalSearchResult } from '@/lib/local/search';

interface MapboxMap {
  on(event: 'load' | 'error', cb: () => void): void;
  on(event: 'click', cb: (event: { lngLat: { lat: number; lng: number }; originalEvent: MouseEvent }) => void): void;
  addControl(control: unknown): void;
  fitBounds(bounds: [[number, number], [number, number]], opts: { padding: number; maxZoom: number; duration: number }): void;
  flyTo(opts: { center: [number, number]; zoom: number; duration: number }): void;
  getCenter(): { lat: number; lng: number };
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
interface MapboxPopup { setDOMContent(node: HTMLElement): this }
interface MapboxGLStatic {
  Map: new (opts: { container: HTMLElement; accessToken: string; style: string; center: [number, number]; zoom: number; attributionControl: boolean }) => MapboxMap;
  Marker: new (opts: { color: string }) => MapboxMarker;
  Popup: new (opts: { offset: number }) => MapboxPopup;
  NavigationControl: new (opts: { showCompass: boolean }) => unknown;
}
declare global { interface Window { mapboxgl?: MapboxGLStatic } }

const VERSION = 'v3.8.0';
let mapboxReady: Promise<MapboxGLStatic | null> | null = null;

function loadMapboxGl(): Promise<MapboxGLStatic | null> {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxReady) return mapboxReady;
  mapboxReady = new Promise((resolve) => {
    if (!document.getElementById('mapbox-gl-css')) {
      const link = document.createElement('link');
      link.id = 'mapbox-gl-css'; link.rel = 'stylesheet';
      link.href = `https://api.mapbox.com/mapbox-gl-js/${VERSION}/mapbox-gl.css`;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.id = 'mapbox-gl-js'; script.async = true;
    script.src = `https://api.mapbox.com/mapbox-gl-js/${VERSION}/mapbox-gl.js`;
    let settled = false;
    const finish = (value: MapboxGLStatic | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (!value) { script.remove(); mapboxReady = null; }
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 12000);
    // Register before append: a cached script can resolve immediately.
    script.onload = () => finish(window.mapboxgl ?? null);
    script.onerror = () => finish(null);
    document.body.appendChild(script);
  });
  return mapboxReady;
}

function popup(gl: MapboxGLStatic, name: string, note?: string | null) {
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = name; content.appendChild(title);
  if (note) { const text = document.createElement('p'); text.textContent = note; content.appendChild(text); }
  return new gl.Popup({ offset: 18 }).setDOMContent(content);
}

export function focusPlaceCard(id: string) {
  const el = document.getElementById(`place-${id}`);
  el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  el?.focus({ preventScroll: true });
}

export function LocalMap({ center, places, height = 340, selected, onSelectPlace, picking = false, onPickLocation, onCancelPick }: {
  center: { lat: number; lng: number };
  places: LocalPlaceRow[];
  height?: number;
  selected?: LocalSearchResult | null;
  onSelectPlace?: (id: string) => void;
  picking?: boolean;
  onPickLocation?: (location: { lat: number; lng: number }) => void;
  onCancelPick?: () => void;
}) {
  const token = mapboxPublicToken();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const glRef = useRef<MapboxGLStatic | null>(null);
  const handlers = useRef({ onSelectPlace, onPickLocation, picking });
  useEffect(() => { handlers.current = { onSelectPlace, onPickLocation, picking }; }, [onSelectPlace, onPickLocation, picking]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const mappable = places.filter((p) => validCoordinates(p.lat, p.lng));

  useEffect(() => {
    if (!token || failed || !container.current) return;
    let disposed = false;
    let map: MapboxMap | null = null;
    let resize: ResizeObserver | null = null;
    const timeout = window.setTimeout(() => { if (!disposed) setFailed(true); }, 20000);
    void loadMapboxGl().then((gl) => {
      if (disposed) return;
      if (!gl || !container.current) { setFailed(true); return; }
      try {
        glRef.current = gl;
        map = new gl.Map({
          container: container.current, accessToken: token, style: 'mapbox://styles/mapbox/streets-v12',
          center: [center.lng, center.lat], zoom: 12, attributionControl: true,
        });
        mapRef.current = map;
        map.on('error', () => { if (!disposed) { clearTimeout(timeout); setFailed(true); } });
        map.on('load', () => {
          if (disposed || !map) return;
          clearTimeout(timeout);
          map.addControl(new gl.NavigationControl({ showCompass: false }));
          resize = new ResizeObserver(() => map?.resize());
          if (container.current) resize.observe(container.current);
          setReady(true);
        });
        map.on('click', (event) => {
          if (!handlers.current.picking || (event.originalEvent.target as Element)?.closest?.('.mapboxgl-marker')) return;
          // Manual point placement only; never extract/copy Mapbox POI attributes.
          const location = { lat: event.lngLat.lat, lng: ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180 };
          if (validCoordinates(location.lat, location.lng)) handlers.current.onPickLocation?.(location);
        });
      } catch { setFailed(true); }
    });
    return () => {
      disposed = true; clearTimeout(timeout); resize?.disconnect(); map?.remove(); mapRef.current = null;
    };
  }, [token, failed, center.lat, center.lng, retry]);

  // Update pins and notes in place after saves; do not use an ids-only cache key.
  useEffect(() => {
    const map = mapRef.current, gl = glRef.current;
    if (!ready || failed || !map || !gl) return;
    const markers = [new gl.Marker({ color: '#0f766e' }).setLngLat([center.lng, center.lat]).setPopup(popup(gl, 'Your property')).addTo(map)];
    const valid = places.filter((p) => validCoordinates(p.lat, p.lng));
    for (const place of valid) {
      const marker = new gl.Marker({ color: place.status === 'hidden' ? '#64748b' : place.isFavorite ? '#f97362' : '#6366f1' })
        .setLngLat([place.lng!, place.lat!]).setPopup(popup(gl, place.name, place.hostNote)).addTo(map);
      const el = marker.getElement();
      el.tabIndex = 0; el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${place.name} · ${place.status}. Open place details`);
      el.style.cursor = 'pointer';
      const select = () => { handlers.current.onSelectPlace?.(place.recommendationId); focusPlaceCard(place.recommendationId); };
      el.addEventListener('click', (event) => { event.stopPropagation(); select(); });
      el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      markers.push(marker);
    }
    if (valid.length) {
      const lats = [center.lat, ...valid.map((p) => p.lat!)], lngs = [center.lng, ...valid.map((p) => p.lng!)];
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 56, maxZoom: 13, duration: 0 });
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, failed, places, center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current, gl = glRef.current;
    if (!ready || failed || !map || !gl || !selected || !validCoordinates(selected.lat, selected.lng)) return;
    map.flyTo({ center: [selected.lng!, selected.lat!], zoom: 15, duration: 0 });
    const marker = new gl.Marker({ color: '#f97362' }).setLngLat([selected.lng!, selected.lat!])
      .setPopup(popup(gl, selected.name, selected.inLibrary ? selected.detail : 'Temporary Mapbox suggestion · not saved')).addTo(map);
    marker.getElement().setAttribute('aria-label', selected.name);
    return () => marker.remove();
  }, [ready, failed, selected]);

  if (!token || failed) {
    return <div id="local-map-panel">
      <div role="status" className="muted" style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
        Interactive map unavailable. You can still search, add places manually, and enter coordinates.
        {token && <button type="button" className="btn btn-sm" style={{ marginLeft: '.5rem', minHeight: 44 }} onClick={() => { setFailed(false); setReady(false); setRetry((n) => n + 1); }}>Retry map</button>}
        {picking && <button type="button" className="btn btn-sm" onClick={onCancelPick}>Cancel location selection</button>}
      </div>
      <StaticMapPreview lat={center.lat} lng={center.lng} markers={mappable.slice(0, 18).map((p) => ({ lat: p.lat!, lng: p.lng!, color: p.isFavorite ? 'f97362' : '6366f1' }))} height={height} emptyHint="A public Mapbox token is needed to display the map." caption="Your property (teal) and saved places." />
    </div>;
  }
  return <div id="local-map-panel" className="card" style={{ overflow: 'hidden' }} data-testid="local-map-card">
    {!ready && <p role="status" className="muted" style={{ padding: '.5rem .9rem' }}>Loading interactive map…</p>}
    <div ref={container} role="region" aria-label="Interactive map of this property's places" style={{ height, width: '100%', cursor: picking ? 'crosshair' : undefined }} data-testid="local-map" />
    <div style={{ padding: '.5rem .9rem', borderTop: '1px solid var(--border)' }}>
      <p className="faint" style={{ margin: 0, fontSize: '.78rem' }}>{picking ? 'Click your chosen location on the map, or position the map with the keyboard and use its center.' : 'Select a saved pin to edit its details. Search results can be viewed on the map; Mapbox suggestions are temporary.'}</p>
      {picking && <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={() => { const c = mapRef.current?.getCenter(); if (c) onPickLocation?.({ lat: c.lat, lng: ((c.lng + 180) % 360 + 360) % 360 - 180 }); }} style={{ minHeight: 44 }}>Use map center</button>
        <button type="button" className="btn btn-sm" onClick={onCancelPick} style={{ minHeight: 44 }}>Cancel location selection</button>
      </div>}
    </div>
  </div>;
}
