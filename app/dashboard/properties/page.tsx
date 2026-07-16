import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements, canCreateProperty } from '@/lib/billing/entitlements';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = { live: 'badge-teal', paused: 'badge-coral', draft: '', archived: '' };

export default async function PropertiesPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const [{ data: properties }, gate, ent] = await Promise.all([
    supabase
      .from('properties')
      .select('id, display_name, slug, status, city, region')
      .eq('host_account_id', ctx.account.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    canCreateProperty(supabase, ctx.account.id),
    getEntitlements(supabase, ctx.account.id),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Properties</h1>
          <p className="muted" style={{ fontSize: '.9rem' }}>{gate.used} of {ent.propertyLimit} used on your plan.</p>
        </div>
        {gate.ok ? (
          <Link href="/dashboard/properties/new" className="btn btn-primary">+ New property</Link>
        ) : (
          <Link href="/dashboard/billing" className="btn btn-coral">Upgrade to add more</Link>
        )}
      </div>

      {(properties?.length ?? 0) === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: '1rem' }}>No properties yet.</p>
          <Link href="/dashboard/properties/new" className="btn btn-primary">Create your first property</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1rem' }}>
          {properties!.map((p) => (
            <Link key={p.id} href={`/dashboard/properties/${p.id}`} className="card" style={{ padding: '1.25rem', display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                <strong>{p.display_name}</strong>
                <span className={`badge ${STATUS_BADGE[p.status] ?? ''}`}>{p.status}</span>
              </div>
              <div className="muted" style={{ fontSize: '.85rem' }}>/{p.slug}</div>
              {(p.city || p.region) && (
                <div className="faint" style={{ fontSize: '.8rem', marginTop: '.35rem' }}>{[p.city, p.region].filter(Boolean).join(', ')}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
