import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-coral',
  acknowledged: 'badge-teal',
  in_progress: 'badge-teal',
  waiting_on_guest: 'badge-coral',
  resolved: '',
  closed: '',
};

const URGENCY_COLOR: Record<string, string> = {
  low: 'var(--text-muted)',
  medium: 'var(--teal)',
  high: 'var(--coral)',
  critical: '#ff5c5c',
};

export default async function ServiceRequestsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null);

  const propMap = new Map((properties ?? []).map((p) => [p.id, p.display_name]));
  const propIds = (properties ?? []).map((p) => p.id);

  let list: {
    id: string;
    property_id: string;
    description: string;
    service_type: string;
    status: string;
    urgency: string;
    resolution_notes: string | null;
    created_at: string;
  }[] = [];
  if (propIds.length) {
    const { data } = await supabase
      .from('service_requests')
      .select('id, property_id, description, service_type, status, urgency, resolution_notes, created_at')
      .in('property_id', propIds)
      .order('created_at', { ascending: false })
      .limit(100);
    list = data ?? [];
  }
  const active = list.filter((s) => !['resolved', 'closed'].includes(s.status));

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Service requests</h1>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          Maintenance, cleaning, and safety issues raised by guests or the concierge. {active.length} active.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">No service requests yet. When a guest reports a problem, it&rsquo;s routed here with a type and urgency so you can act fast.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {list.map((s) => (
            <div key={s.id} className="card" style={{ padding: '1.15rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
                <span className="faint" style={{ fontSize: '.78rem' }}>
                  {propMap.get(s.property_id) ?? 'Property'} &middot; {s.service_type.replace(/_/g, ' ')}
                </span>
                <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: URGENCY_COLOR[s.urgency] ?? 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {s.urgency}
                  </span>
                  <span className={`badge ${STATUS_BADGE[s.status] ?? ''}`}>{s.status.replace(/_/g, ' ')}</span>
                </span>
              </div>
              <p style={{ margin: 0 }}>{s.description}</p>
              {s.resolution_notes ? (
                <p className="muted" style={{ fontSize: '.85rem', margin: '.5rem 0 0', paddingLeft: '.75rem', borderLeft: '2px solid var(--border)' }}>
                  {s.resolution_notes}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
