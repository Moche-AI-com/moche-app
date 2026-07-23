import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth, computeCardHealth, BRAIN_CARDS, type CardKey } from '@/lib/brain/health';
import { BRAIN_CATEGORY_LABELS } from '@/lib/constants';
import type { BrainCategory } from '@/lib/constants';
import { BrainManager } from './BrainManager';
import { BrainCards } from './BrainCards';
import { IngestPanel } from './IngestPanel';
import { AppliancePanel } from './AppliancePanel';

export const dynamic = 'force-dynamic';

export default async function BrainPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { card?: string; edit?: string };
}) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();

  const [{ data: items }, { data: settings }, { count: recCount }, { count: emergencyContacts }, { count: primaryContacts }] =
    await Promise.all([
      supabase
        .from('brain_items')
        .select('id, title, body, category, visibility, status, source_type, updated_at, deleted_at')
        .eq('property_id', params.id)
        .is('deleted_at', null)
        .order('category', { ascending: true })
        .order('updated_at', { ascending: false }),
      supabase.from('property_settings').select('confidence_threshold').eq('property_id', params.id).maybeSingle(),
      supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('property_id', params.id).is('deleted_at', null),
      supabase.from('property_contacts').select('id', { count: 'exact', head: true }).eq('property_id', params.id).eq('is_emergency', true),
      supabase.from('property_contacts').select('id', { count: 'exact', head: true }).eq('property_id', params.id).eq('is_primary', true),
    ]);

  const brainItems = (items ?? []).map((i) => ({ category: i.category, status: i.status, deleted_at: i.deleted_at, visibility: i.visibility }));
  const health = computeBrainHealth(brainItems);

  const cardHealth = computeCardHealth(brainItems, {
    hasAddress: !!(access.property.address_line1 && access.property.address_line1.trim()),
    recommendationCount: recCount ?? 0,
    emergencyContactCount: emergencyContacts ?? 0,
    primaryContactCount: primaryContacts ?? 0,
    hasSettings: !!settings,
    confidenceThresholdSet: !!settings && typeof settings.confidence_threshold === 'number',
  });

  // Optional card filter: when a card is opened, scope the editor list + add form to that card's categories.
  const activeCard = BRAIN_CARDS.find((c) => c.key === (searchParams.card as CardKey | undefined));
  const filterCategories = activeCard?.categories ?? [];
  const filteredItems = activeCard && filterCategories.length > 0
    ? (items ?? []).filter((i) => filterCategories.includes(i.category))
    : (items ?? []);
  const defaultCategory: BrainCategory = activeCard?.primaryCategory ?? 'core';

  return (
    <div>
      <Link href={`/dashboard/properties/${params.id}`} className="muted" style={{ fontSize: '.85rem' }}>← {access.property.display_name}</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Property Brain</h1>
          <p className="faint" style={{ fontSize: '.85rem' }}>Health {cardHealth.score}/100 · {health.totalItems} items</p>
        </div>
      </div>

      {!access.can.editBrain && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>You have read-only access to this Brain.</div>
      )}

      <BrainCards
        propertyId={params.id}
        propertyName={access.property.display_name}
        propertySlug={access.property.slug}
        health={cardHealth}
        canEdit={access.can.editBrain}
        graphItems={(items ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          visibility: i.visibility,
          status: i.status,
          sourceType: i.source_type,
          bodyPreview: (i.body ?? '').slice(0, 160),
        }))}
        categoryLabels={BRAIN_CATEGORY_LABELS as Record<string, string>}
      />

      <div className="brain-shell">
        <div id="brain-editor" style={{ scrollMarginTop: '1rem' }}>
          {activeCard && (
            <div className="alert alert-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }} data-testid="card-filter-banner">
              <span style={{ fontSize: '.85rem' }}>
                <span aria-hidden>{activeCard.icon}</span> Editing <strong>{activeCard.title}</strong>
              </span>
              <Link href={`/dashboard/properties/${params.id}/brain`} className="btn btn-sm btn-ghost" data-testid="button-clear-card-filter">Show all</Link>
            </div>
          )}
          <BrainManager
            propertyId={params.id}
            canEdit={access.can.editBrain}
            categories={Object.entries(BRAIN_CATEGORY_LABELS) as [BrainCategory, string][]}
            defaultCategory={defaultCategory}
            editItemId={searchParams.edit}
            items={filteredItems.map((i) => ({
              id: i.id,
              title: i.title,
              body: i.body ?? '',
              category: i.category,
              visibility: i.visibility,
              status: i.status,
              sourceType: i.source_type,
            }))}
          />
        </div>
        <div className="brain-sidebar">
          {access.can.editBrain && (
            <Link href={`/dashboard/properties/${params.id}/recommendations`} className="btn btn-sm btn-ghost btn-block" style={{ marginBottom: '1rem' }}>
              Manage local recommendations →
            </Link>
          )}
          {access.can.editBrain && <IngestPanel propertyId={params.id} />}
          {access.can.editBrain && (
            <div style={{ marginTop: '1rem' }}>
              <AppliancePanel propertyId={params.id} />
            </div>
          )}
          <div className="card" style={{ padding: '1.25rem', marginTop: access.can.editBrain ? '1rem' : 0 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '.75rem' }}>Coverage</h3>
            {health.categories.map((c) => (
              <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', padding: '.3rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: c.present ? 'var(--text)' : 'var(--text-faint)' }}>
                  {c.required && <span style={{ color: 'var(--coral)' }}>* </span>}{c.label.split('(')[0].trim()}
                </span>
                <span className={c.present ? 'badge badge-teal' : 'faint'}>{c.count || '—'}</span>
              </div>
            ))}
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.6rem' }}>* required to go live</p>
          </div>
        </div>
      </div>
    </div>
  );
}
