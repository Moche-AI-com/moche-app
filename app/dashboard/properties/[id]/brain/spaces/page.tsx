// Spaces & features (unified) — Manage Brain redesign, slice 2.
//
// One surface for "what does this place have": the registry applicability
// predicates (which decide the completeness denominator and the go-live gate)
// alongside the host's own custom sections. Today this answer is spread across
// the Completeness panel, the Features panel, and the onboarding checklist;
// this route is the consolidation target.
//
// Additive route — no existing file is modified. All writes run through the
// existing server actions, so permission checks and audit logging are unchanged.
// Direct URL: /dashboard/properties/<id>/brain/spaces

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  APPLICABILITY_LABELS,
  APPLICABILITY_PREDICATES,
  REGISTRY_FIELDS,
} from '@/lib/brain/completeness';
import { SpacesClient } from './SpacesClient';

export const dynamic = 'force-dynamic';

export default async function SpacesPage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  // Redirects unless the signed-in host can access this property.
  await requirePropertyAccess(propertyId);

  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('display_name')
    .eq('id', propertyId)
    .maybeSingle();
  if (!property) notFound();

  const [{ data: applicabilityRows }, { data: featureRows }] = await Promise.all([
    supabase
      .from('property_applicability')
      .select('predicate, applies')
      .eq('property_id', propertyId),
    supabase
      .from('property_features')
      .select('id, label, location, guest_access, notes, created_via, archived_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true }),
  ]);

  const appliesByPredicate = new Map(
    (applicabilityRows ?? []).map((r) => [r.predicate, r.applies] as const),
  );
  const labels = APPLICABILITY_LABELS as Record<string, string>;

  const predicates = APPLICABILITY_PREDICATES.map((p) => ({
    predicate: p,
    label: labels[p] ?? p.replace(/_/g, ' '),
    gatedCount: REGISTRY_FIELDS.filter((f) => f.applicability === p && f.gap_weight > 0).length,
    applies: appliesByPredicate.has(p) ? appliesByPredicate.get(p)! : null,
  }));

  return (
    <section style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <p style={{ margin: 0 }}>
        <Link href={`/dashboard/properties/${propertyId}/brain`}>← Back to Manage Brain</Link>
      </p>
      <h1 style={{ fontSize: '1.4rem', margin: '0.75rem 0 0.25rem' }}>Spaces &amp; features</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        {property.display_name} — tell the concierge what this place has. Your answers decide which
        sections exist in the brain and what the go-live gate expects; you are never scored on
        something the property does not have.
      </p>

      <SpacesClient propertyId={propertyId} predicates={predicates} features={featureRows ?? []} />

      <p style={{ marginTop: '2rem', fontSize: '.85rem', opacity: 0.7 }}>
        <Link href={`/dashboard/properties/${propertyId}/brain/go-live`}>
          See what the publish gate requires →
        </Link>
      </p>
    </section>
  );
}
