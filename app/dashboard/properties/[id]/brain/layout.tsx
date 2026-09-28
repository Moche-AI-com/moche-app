import type { ReactNode } from 'react';
import { ApplianceEntryPlacement } from './ApplianceEntryPlacement';

export default async function BrainLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      {children}
      <ApplianceEntryPlacement propertyId={id} />
    </div>
  );
}
