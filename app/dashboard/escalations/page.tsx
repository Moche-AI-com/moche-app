import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  open: 'badge-coral',
  answered: 'badge-teal',
  resolved: '',
  dismissed: '',
};

export default async function EscalationsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  // RLS scopes properties to the host account; escalations join through them.
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
    question: string;
    status: string;
    host_response: string | null;
    created_at: string;
    responded_at: string | null;
  }[] = [];
  if (propIds.length) {
    const { data: escalations } = await supabase
      .from('escalations')
      .select('id, property_id, question, status, host_response, created_at, responded_at')
      .in('property_id', propIds)
      .order('created_at', { ascending: false })
      .limit(100);
    list = escalations ?? [];
  }
  const open = list.filter((e) => e.status === 'open');

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Escalations</h1>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          Guest questions the concierge couldn&rsquo;t answer confidently. {open.length} awaiting a response.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">No escalations yet. When the AI concierge is unsure, the question lands here so you can answer it and teach the Property Brain.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {list.map((e) => (
            <div key={e.id} className="card" style={{ padding: '1.15rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
                <span className="faint" style={{ fontSize: '.78rem' }}>{propMap.get(e.property_id) ?? 'Property'}</span>
                <span className={`badge ${STATUS_BADGE[e.status] ?? ''}`}>{e.status}</span>
              </div>
              <p style={{ margin: '0 0 .5rem', fontWeight: 500 }}>{e.question}</p>
              {e.host_response ? (
                <p className="muted" style={{ fontSize: '.85rem', margin: 0, paddingLeft: '.75rem', borderLeft: '2px solid var(--border)' }}>
                  {e.host_response}
                </p>
              ) : (
                <Link href={`/dashboard/properties/${e.property_id}/brain`} className="btn btn-sm btn-primary" style={{ marginTop: '.25rem' }}>
                  Answer &amp; teach the Brain
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
