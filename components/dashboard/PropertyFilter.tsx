import Link from 'next/link';
import { Building2 } from 'lucide-react';

// Scopes the dashboard home to one property (or "All properties"). Plain
// server-rendered links (not client state) so the choice lives entirely in
// the URL: it survives a refresh, is shareable, and needs no localStorage.
// The `properties` list passed in is whatever the caller's own Supabase
// query already returned — RLS decides which rows exist, so a non-admin
// simply never receives (and can never select) a property they aren't a
// member of. Reuses the same pill styling as the Escalations property filter
// (.esc-filter-pill) so the pattern feels identical everywhere it appears.
export interface PropertyFilterOption {
  id: string;
  name: string;
}

export function PropertyFilter({
  properties,
  activeId,
  basePath = '/dashboard',
}: {
  properties: PropertyFilterOption[];
  activeId: string | null;
  basePath?: string;
}) {
  // A single property is never worth a filter row — there's nothing to switch between.
  if (properties.length <= 1) return null;

  return (
    <div className="esc-filter-row" role="tablist" aria-label="Filter dashboard by property" data-testid="property-filter">
      <Link
        href={basePath}
        className={`esc-filter-pill${!activeId ? ' is-active' : ''}`}
        aria-current={!activeId ? 'true' : undefined}
        data-testid="property-filter-all"
      >
        <Building2 size={13} aria-hidden />
        All properties
      </Link>
      {properties.map((p) => {
        const isActive = activeId === p.id;
        return (
          <Link
            key={p.id}
            href={`${basePath}?property=${p.id}`}
            className={`esc-filter-pill${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            data-testid="property-filter-option"
          >
            {p.name}
          </Link>
        );
      })}
    </div>
  );
}
