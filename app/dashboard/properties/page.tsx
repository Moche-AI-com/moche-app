import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { STATUS_BADGE } from '@/lib/constants';
import { cardAddress } from '@/lib/properties/address';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const [{ data: properties }, gate] = await Promise.all([
    // Archived properties are excluded and listed under Reports instead,
    // alongside the archived service requests, extras, and stays they relate to.
    // Leaving them here defeated the point of archiving: a host with a dozen
    // retired listings still had to scroll past all of them.
    supabase
      .from('properties')
      .select('id, display_name, status, address_line1, address_line2, city, region, postal_code, country')
      .eq('host_account_id', ctx.account.id)
      .is('deleted_at', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    canCreateProperty(supabase, ctx.account.id),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Properties</h1>
        </div>
        {gate.ok ? (
          // Same treatment as the home dashboard action, so the primary
          // "add a property" affordance looks identical wherever it appears.
          <Link href="/dashboard/properties/new" className="btn dash-newbtn">
            <span className="dash-newbtn-icon" aria-hidden>
              <Plus size={14} aria-hidden />
            </span>
            New property
          </Link>
        ) : (
          <Link href="/dashboard/profile/billing" className="btn btn-coral">Upgrade to add more</Link>
        )}
      </div>

      {(properties?.length ?? 0) === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: '1rem' }}>No active properties.</p>
          <Link href="/dashboard/properties/new" className="btn btn-primary">Create a property</Link>
          <p className="faint" style={{ fontSize: '.78rem', marginTop: '.9rem' }}>
            Archived a property? It’s in <Link href="/dashboard/reports" className="gradient-text" style={{ fontWeight: 600 }}>Reports</Link>, and you can restore it from there.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1rem' }}>
          {properties!.map((p) => {
            const address = cardAddress(p);
            return (
              <div key={p.id}>
                <Link href={`/dashboard/properties/${p.id}`} className="card card-interactive rise-in dash-prop-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                    <strong>{p.display_name}</strong>
                    <span className={`badge ${STATUS_BADGE[p.status] ?? ''}`}>{p.status}</span>
                  </div>
                  {address ? (
                    <div className="muted" style={{ fontSize: '.85rem' }}>{address}</div>
                  ) : (
                    (p.city || p.region) && (
                      <div className="faint" style={{ fontSize: '.8rem', marginTop: '.35rem' }}>{[p.city, p.region].filter(Boolean).join(', ')}</div>
                    )
                  )}
                </Link>
                {!address && (
                  // Sits outside the card's own link (nested links are invalid
                  // HTML) and lands the host directly on the Settings address form.
                  <Link
                    href={`/dashboard/properties/${p.id}/settings`}
                    className="faint"
                    style={{ display: 'inline-block', fontSize: '.78rem', marginTop: '.3rem', paddingLeft: '.25rem' }}
                  >
                    Add the main address →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
