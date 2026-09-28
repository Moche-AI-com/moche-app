'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function ApplianceEntry({ propertyId }: { propertyId: string }) {
  return (
    <nav aria-label="Manage Brain tools" className="card" style={{ padding: '1rem', margin: '1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <strong>Appliances</strong>
          <p className="faint" style={{ margin: '.35rem 0 0' }}>
            Add devices, review manuals, and approve guest guidance and answers.
          </p>
        </div>
        <Link className="btn btn-primary btn-sm" href={`/dashboard/properties/${propertyId}/appliances`}>
          Manage appliances →
        </Link>
      </div>
    </nav>
  );
}

export function ApplianceEntryPlacement({ propertyId }: { propertyId: string }) {
  const pathname = usePathname();
  const isBrainHome = pathname.replace(/\/$/, '') === `/dashboard/properties/${propertyId}/brain`;
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isBrainHome) { setSlot(null); return; }
    let container: HTMLDivElement | null = null;
    const position = () => {
      const empty = document.getElementById('brain-empty-sections');
      if (empty?.parentElement) {
        if (!container) {
          container = document.createElement('div');
          container.dataset.brainApplianceSlot = 'true';
        }
        if (container.parentElement !== empty.parentElement || container.nextElementSibling !== empty) {
          empty.parentElement.insertBefore(container, empty);
        }
        setSlot(container);
      } else {
        container?.remove();
        setSlot(null);
      }
    };
    const observer = new MutationObserver(position);
    observer.observe(document.body, { childList: true, subtree: true });
    position();
    return () => { observer.disconnect(); container?.remove(); };
  }, [isBrainHome]);

  if (!isBrainHome) return null;
  const card = <ApplianceEntry propertyId={propertyId} />;
  return slot ? createPortal(card, slot) : card;
}
