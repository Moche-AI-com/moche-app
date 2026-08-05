// Pure lifecycle-view helpers, kept out of the React component so they can be
// unit tested without pulling next/link and lucide-react into the test runner.
// The rendering half lives in components/dashboard/LifecycleToggle.tsx, which
// re-exports these so callers only need one import.

export type LifecycleView = 'active' | 'past';

/**
 * Narrows an untrusted `searchParams` value to a LifecycleView.
 * Anything unrecognised (including arrays, from `?view=a&view=b`) falls back to
 * 'active', so a hand-edited URL can never render a blank page.
 */
export function parseLifecycleView(raw: string | string[] | undefined): LifecycleView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'past' ? 'past' : 'active';
}

/** Maps the UI view onto the database's lifecycle_state enum value. */
export function lifecycleStatusFor(view: LifecycleView): 'active' | 'archived' {
  return view === 'past' ? 'archived' : 'active';
}
