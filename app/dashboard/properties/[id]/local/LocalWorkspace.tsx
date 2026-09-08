'use client';

import { useCallback, useState } from 'react';
import { LocalSearch } from './LocalSearch';
import { LocalMap, focusPlaceCard } from './LocalMap';
import { LocalPlaceManager } from './LocalPlaceManager';
import type { PickedLocation } from './LocalPlaceForm';
import type { LocalPlaceRow } from '@/lib/local/canonical';
import type { LocalSearchResult } from '@/lib/local/search';

export function LocalWorkspace({ propertyId, places, center, canEdit }: {
  propertyId: string; places: LocalPlaceRow[]; center: { lat: number; lng: number } | null; canEdit: boolean;
}) {
  const [selected, setSelected] = useState<LocalSearchResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualRequest, setManualRequest] = useState(0);
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const clearSelection = useCallback(() => setSelected(null), []);
  function selectPlace(id: string) {
    // Reopen even if the user closed the same editor since the last selection.
    setSelectedId(null);
    requestAnimationFrame(() => { setSelectedId(id); focusPlaceCard(id); });
  }
  return <div style={{ marginBottom: '1.25rem' }}>
    {canEdit && <LocalSearch propertyId={propertyId} onClear={clearSelection} onAddManual={() => { setSelected(null); setPickTarget(null); setManualRequest((n) => n + 1); }} onSelect={(result) => {
      setSelected(result); setPickTarget(null);
      if (result.inLibrary) selectPlace(result.id);
      else document.getElementById('local-map-panel')?.scrollIntoView({ block: 'center' });
    }} />}
    {center ? <LocalMap center={center} places={places} selected={selected} onSelectPlace={canEdit ? selectPlace : undefined}
      picking={pickTarget !== null} onCancelPick={() => setPickTarget(null)} onPickLocation={(location) => {
        if (pickTarget) {
          setPicked({ ...location, target: pickTarget });
          document.getElementById(`local-form-${pickTarget}-lat`)?.scrollIntoView({ block: 'center' });
        }
        setPickTarget(null);
      }} /> : <p className="muted" role="status">Set the property address in Configuration to enable the nearby map. Manual places can still be added below.</p>}
    {selected && !selected.inLibrary && <p className="muted" style={{ fontSize: '.85rem' }} role="status">Map preview: {selected.name} · temporary suggestion, not saved.</p>}
    <LocalPlaceManager propertyId={propertyId} places={places} canEdit={canEdit} selectedId={selectedId} manualRequest={manualRequest} pickedLocation={picked}
      onPickLocation={center ? (target) => { setSelected(null); setPickTarget(target); document.getElementById('local-map-panel')?.scrollIntoView({ block: 'center' }); } : undefined} />
  </div>;
}
