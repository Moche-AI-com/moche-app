'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, LayoutGrid, RotateCcw } from 'lucide-react';
import { useZoneOrder } from '@/lib/dashboard/use-zone-order';
import styles from './overview.module.css';

export interface OverviewZone {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Reorderable container for the Operations Overview zones.
 *
 * The server page composes each zone's content and passes it in as ordinary
 * props; this client component owns only the ordering. In "Customize layout"
 * mode hosts drag zones top-to-bottom (or use the keyboard-accessible up/down
 * controls); the arrangement persists locally via `useZoneOrder`.
 */
export function OverviewBoard({ zones }: { zones: OverviewZone[] }) {
  const defaults = zones.map((z) => z.id);
  const { order, move, reset } = useZoneOrder(defaults);
  const [customizing, setCustomizing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = new Map(zones.map((z) => [z.id, z]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((z): z is OverviewZone => Boolean(z));
  const isCustomized = order.join('|') !== defaults.join('|');

  return (
    <div className={styles.board}>
      <div className={styles.boardBar}>
        <button
          type="button"
          className={styles.boardToggle}
          aria-pressed={customizing}
          onClick={() => setCustomizing((v) => !v)}
        >
          {customizing ? <LayoutGrid size={14} aria-hidden /> : <GripVertical size={14} aria-hidden />}
          {customizing ? 'Done' : 'Customize layout'}
        </button>
        {isCustomized ? (
          <button type="button" className={styles.boardReset} onClick={reset}>
            <RotateCcw size={13} aria-hidden /> Reset to default
          </button>
        ) : null}
      </div>

      <div className={customizing ? styles.zoneListEditing : styles.zoneList}>
        {ordered.map((zone, index) => (
          <section
            key={zone.id}
            aria-label={zone.label}
            draggable={customizing}
            onDragStart={(e) => {
              setDragId(zone.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', zone.id);
            }}
            onDragOver={(e) => {
              if (!customizing || !dragId || dragId === zone.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverId(zone.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) move(dragId, index);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={[
              styles.zone,
              customizing ? styles.zoneEditing : '',
              dragId === zone.id ? styles.zoneDragging : '',
              overId === zone.id && dragId !== zone.id ? styles.zoneDropTarget : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {customizing ? (
              <div className={styles.zoneHandle}>
                <GripVertical size={15} aria-hidden />
                <span className={styles.zoneTitle}>{zone.label}</span>
                <span className={styles.zoneMoveGroup}>
                  <button
                    type="button"
                    aria-label={`Move ${zone.label} up`}
                    disabled={index === 0}
                    onClick={() => move(zone.id, index - 1)}
                    className={styles.zoneMoveBtn}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${zone.label} down`}
                    disabled={index === ordered.length - 1}
                    onClick={() => move(zone.id, index + 1)}
                    className={styles.zoneMoveBtn}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                </span>
              </div>
            ) : null}
            {zone.content}
          </section>
        ))}
      </div>
    </div>
  );
}
