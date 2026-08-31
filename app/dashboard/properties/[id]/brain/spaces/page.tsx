// Spaces & features (unified) — Manage Brain redesign, slices 2 + consolidation.
//
// The single surface for "what does this place have": the registry applicability board
// (which decides the completeness denominator and the go-live gate) on top, and the
// full custom-spaces manager (catalog picker, structured inputs, Draft with AI, edit,
// archive) below it. The Brain page links here from its header; the panels that used
// to do these jobs inline on the Brain page are retired from it.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  APPLICABILITY_LABELS,
  APPLICABILITY_PREDICATES,
  REGISTRY_FIELDS,
} from '@/lib/brain/completeness';
import { type PropertyFeature } from '@/lib/brain/taxonomy';
import { FeaturesPanel } from '../FeaturesPanel';
import { SpacesClient } from './SpacesClient';

export const dynamic = 'force-dynamic';

export default async function SpacesPage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);

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
      .select('id, label, catalog_key, location, guest_access, notes, created_via')
      .eq('property_id', propertyId)
      .is('archived_at', null)
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

  const features: PropertyFeature[] = (featureRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    catalogKey: f.catalog_key,
    location: f.location,
    guestAccess: f.guest_access as PropertyFeature['guestAccess'],
    notes: f.notes,
    createdVia: f.created_via as PropertyFeature['createdVia'],
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

      <SpacesClient propertyId={propertyId} predicates={predicates} />

      <div style={{ marginTop: '2rem' }}>
        <FeaturesPanel propertyId={propertyId} canEdit={access.can.editBrain} features={features} />
      </div>

      <p style={{ marginTop: '2rem', fontSize: '.85rem', opacity: 0.7 }}>
        <Link href={`/dashboard/properties/${propertyId}/brain/go-live`}>
          See what the publish gate requires →
        </Link>
      </p>
    </section>
  );
}
