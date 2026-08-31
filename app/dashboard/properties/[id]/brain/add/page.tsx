// Unified Add-knowledge page (Manage Brain redesign, slice 3).
//
// One calm surface for every way knowledge enters the Brain: Write (direct file,
// optional AI improve), Upload (document -> review proposal), URL, and Paste. All
// writes run through the existing actions/routes — saveBrainItemAction and the three
// ingest endpoints — so indexing, audit, and the human review boundary are unchanged.
//
// Additive route — no existing file is modified. Direct URL:
// /dashboard/properties/<id>/brain/add

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BRAIN_SECTIONS } from '@/lib/brain/taxonomy';
import { AddKnowledgeClient } from './AddKnowledgeClient';

export const dynamic = 'force-dynamic';

export default async function AddKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);

  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('display_name')
    .eq('id', propertyId)
    .maybeSingle();
  if (!property) notFound();

  // Custom spaces join the section picker as `feature:<id>` targets, exactly like the
  // Brain manager's add form.
  const { data: featureRows } = await supabase
    .from('property_features')
    .select('id, label')
    .eq('property_id', propertyId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  const sections = BRAIN_SECTIONS.map((s) => ({ value: s.id, label: s.label, blurb: s.blurb }));

  return (
    <section style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <p style={{ margin: 0 }}>
        <Link href={`/dashboard/properties/${propertyId}/brain`}>← Back to Manage Brain</Link>
      </p>
      <h1 style={{ fontSize: '1.4rem', margin: '0.75rem 0 0.25rem' }}>Add knowledge</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        {property.display_name} — write it yourself and let AI tidy it up, or bring a file, a URL,
        or pasted notes. File and URL imports always land in your review queue before guests see
        them.
      </p>

      {!access.can.editBrain ? (
        <div className="alert alert-info" style={{ marginTop: '1rem' }}>
          You have read-only access to this Brain.
        </div>
      ) : (
        <div style={{ marginTop: '1.25rem' }}>
          <AddKnowledgeClient
            propertyId={propertyId}
            sections={sections}
            features={(featureRows ?? []).map((f) => ({ id: f.id, label: f.label }))}
          />
        </div>
      )}
    </section>
  );
}
