import { PropertyScopeSelect } from './PropertyScopeSelect';

// Backward-compatible public facade for callers that used the original
// property pill filter. Scope selection now lives in one accessible native
// dropdown, while this API remains stable for dashboard reports and pages.
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
  return <PropertyScopeSelect properties={properties} activeId={activeId} basePath={basePath} />;
}
