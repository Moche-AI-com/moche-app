'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export interface PropertyScopeOption {
  id: string;
  name: string;
}

export function PropertyScopeSelect({
  properties,
  activeId,
  basePath = '/dashboard',
}: {
  properties: PropertyScopeOption[];
  activeId: string | null;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // There is nothing to switch between for a single-property account.
  if (properties.length <= 1) return null;

  function updateScope(propertyId: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (propertyId) next.set('property', propertyId);
    else next.delete('property');
    const query = next.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <div style={{ display: 'grid', gap: '.35rem', minWidth: 'min(100%, 17rem)' }} data-testid="property-filter">
      <label htmlFor="property-scope" className="label" style={{ marginBottom: 0 }}>
        Property scope
      </label>
      <select
        id="property-scope"
        className="select"
        value={activeId ?? ''}
        onChange={(event) => updateScope(event.target.value)}
        data-testid="property-filter-select"
        style={{
          minHeight: 44,
          background: 'var(--surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <option value="" data-testid="property-filter-all">All properties</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id} data-testid="property-filter-option">
            {property.name}
          </option>
        ))}
      </select>
    </div>
  );
}
