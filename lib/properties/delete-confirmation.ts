/**
 * The typed confirmation gate for permanently deleting a property.
 *
 * Lives in its own module, separate from `purge.ts`, because `purge.ts` is
 * marked `server-only` (it reaches for the service-role Supabase client) while
 * the confirmation dialog is a client component that needs the required word to
 * label its input. Importing the constant from `purge.ts` pulled the whole
 * server module into the client bundle and failed the production build.
 *
 * The server action re-validates with `isDeleteConfirmed` on every submission,
 * so the client-side gate is a courtesy, not the enforcement point.
 */
export const DELETE_CONFIRMATION_WORD = 'delete';

/**
 * Normalises whatever the host typed before comparing it to the required word.
 *
 * Trimmed and lowercased on purpose: mobile keyboards autocapitalise the first
 * letter and iOS appends a trailing space after autocomplete, and punishing a
 * host for "Delete " when they clearly meant it just teaches them to distrust
 * the dialog. We do NOT strip interior characters — "delete it" is still a
 * refusal, because the point of the gate is that the host typed exactly the
 * word we asked for and nothing else.
 */
export function isDeleteConfirmed(typed: string | null | undefined): boolean {
  if (typeof typed !== 'string') return false;
  return typed.trim().toLowerCase() === DELETE_CONFIRMATION_WORD;
}
