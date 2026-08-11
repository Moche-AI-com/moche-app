/**
 * One definition of the Knowledge Queue href so the dashboard tile, the queue
 * page's own filter chips, and any future notification deep-link can never
 * disagree about the parameter name.
 *
 * Directive E.5 wants a single-property scope (or an all-properties scope with
 * exactly one affected property) to open that property's queue directly, and
 * multiple affected properties to offer a chooser first. The chooser is the
 * per-property list already rendered on the tile, so the only thing missing was
 * a property-scoped URL to point each row at.
 */
export const KNOWLEDGE_QUEUE_PATH = '/dashboard/updates';

export interface KnowledgeQueueLinkOptions {
  /** Property to scope the queue to. Null/undefined means the whole account. */
  propertyId?: string | null;
  /** 'reviewed' switches to the reviewed tab; 'pending' is the default view. */
  view?: 'pending' | 'reviewed';
}

export function knowledgeQueueHref({ propertyId, view }: KnowledgeQueueLinkOptions = {}): string {
  const params = new URLSearchParams();
  if (view === 'reviewed') params.set('view', 'reviewed');
  if (propertyId) params.set('property', propertyId);
  const query = params.toString();
  return query ? `${KNOWLEDGE_QUEUE_PATH}?${query}` : KNOWLEDGE_QUEUE_PATH;
}

export interface QueuePropertyCount {
  propertyId: string;
  pending: number;
}

/**
 * Resolves where the dashboard tile's primary "Open Knowledge Queue" control
 * should go. Returning a property-scoped href only when exactly one property is
 * affected keeps the host one click from the decision without ever guessing
 * which of several properties they meant.
 */
export function primaryQueueHref(rows: QueuePropertyCount[], scopedPropertyId?: string | null): string {
  if (scopedPropertyId) return knowledgeQueueHref({ propertyId: scopedPropertyId });
  const affected = rows.filter((row) => row.pending > 0);
  if (affected.length === 1) return knowledgeQueueHref({ propertyId: affected[0].propertyId });
  return knowledgeQueueHref();
}
