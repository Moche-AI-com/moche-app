import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth } from '@/lib/brain/health';
import { BRAIN_CATEGORY_LABELS } from '@/lib/constants';
import type { BrainCategory } from '@/lib/constants';
import { BrainManager } from './BrainManager';
import { IngestPanel } from './IngestPanel';

export const dynamic = 'force-dynamic';

export default async function BrainPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();

  const { data: items } = await supabase
    .from('brain_items')
    .select('id, title, body, category, visibility, status, source_type, updated_at, deleted_at')
    .eq('property_id', params.id)
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('updated_at', { ascending: false });

  const health = computeBrainHealth((items ?? []).map((i) => ({ category: i.category, status: i.status, deleted_at: i.deleted_at, visibility: i.visibility })));

  // Group items by category for display.
  const byCategory = new Map<BrainCategory, typeof items>();
  for (const it of items ?? []) {
    const arr = byCategory.get(it.category) ?? [];
    arr!.push(it);
    byCategory.set(it.category, arr);
  }

  return (
    <div>
      <Link href={`/dashboard/properties/${params.id}`} className="muted" style={{ fontSize: '.85rem' }}>← {access.property.display_name}</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Property Brain</h1>
          <p className="faint" style={{ fontSize: '.85rem' }}>Health {health.score}/100 · {health.totalItems} items</p>
        </div>
      </div>

      {!access.can.editBrain && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>You have read-only access to this Brain.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: '1.5rem', alignItems: 'start' }}>
        <div>
          <BrainManager
            propertyId={params.id}
            canEdit={access.can.editBrain}
            categories={Object.entries(BRAIN_CATEGORY_LABELS) as [BrainCategory, string][]}
            items={(items ?? []).map((i) => ({
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
        <div style={{ position: 'sticky', top: '1rem' }}>
          {access.can.editBrain && <IngestPanel propertyId={params.id} />}
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
