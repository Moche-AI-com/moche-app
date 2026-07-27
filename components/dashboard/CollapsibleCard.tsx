'use client';

import { ChevronDown } from 'lucide-react';

/**
 * Collapse toggle for a dashboard card header. Renders just the button —
 * callers place it in their own header markup (next to a range selector, a
 * score chip, etc.) and pair it with <CollapsibleBody> wrapping the card's
 * content below the header.
 */
export function CollapseToggle({
  collapsed,
  onToggle,
  panelId,
  label,
}: {
  collapsed: boolean;
  onToggle: () => void;
  panelId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="dash-collapse-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={panelId}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
      data-testid="collapse-toggle"
    >
      <ChevronDown size={16} aria-hidden data-collapsed={collapsed} className="dash-collapse-chevron" />
    </button>
  );
}

/**
 * Animates height via grid-template-rows 1fr -> 0fr rather than measuring
 * pixel heights in JS. This handles content of any/changing height (a chart,
 * a variable-length list) without a ResizeObserver, and degrades to an
 * instant show/hide under prefers-reduced-motion (see globals.css).
 */
export function CollapsibleBody({
  id,
  collapsed,
  children,
}: {
  id: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="dash-collapsible" data-collapsed={collapsed} aria-hidden={collapsed}>
      <div className="dash-collapsible-inner">{children}</div>
    </div>
  );
}
