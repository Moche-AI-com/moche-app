import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DOC_LABEL: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  dpa: 'Data Processing Addendum',
};

const DOC_HREF: Record<string, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  dpa: '/legal/dpa',
};

function label(slug: string): string {
  return DOC_LABEL[slug] ?? slug.replace(/[-_]/g, ' ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/**
 * The host's own acceptance record: which version of each document they agreed to,
 * and when. This is the evidence side of the re-acceptance gate - a host should be
 * able to see what they signed without asking us for it.
 */
export default async function ProfileLegalPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const [acceptancesRes, docsRes] = await Promise.all([
    supabase
      .from('legal_acceptances')
      .select('id, document_slug, document_version, accepted_at, context')
      .eq('user_id', ctx.user.id)
      .order('accepted_at', { ascending: false }),
    supabase
      .from('legal_documents')
      .select('slug, version, effective_date')
      .order('effective_date', { ascending: false }),
  ]);

  const acceptances = acceptancesRes.data ?? [];
  const docs = docsRes.data ?? [];

  // Current published version per slug, so an out-of-date acceptance is visible
  // rather than implied.
  const current = new Map<string, string>();
  for (const d of docs) if (!current.has(d.slug)) current.set(d.slug, d.version);

  // Latest acceptance per slug.
  const latest = new Map<string, (typeof acceptances)[number]>();
  for (const a of acceptances) if (!latest.has(a.document_slug)) latest.set(a.document_slug, a);

  const slugs = Array.from(new Set([...current.keys(), ...latest.keys()])).sort();

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Legal and agreements</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        Exactly which version of each document you accepted, and when. If we publish a new
        version, you are asked to accept it before you keep using the dashboard.
      </p>

      {slugs.length === 0 ? (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
          <p className="muted" style={{ fontSize: '.88rem', margin: 0 }}>
            No acceptance recorded yet.
          </p>
        </div>
      ) : (
        <ul className="report-list" style={{ margin: 0, maxWidth: 680 }}>
          {slugs.map((slug) => {
            const a = latest.get(slug);
            const cur = current.get(slug);
            const stale = !!a && !!cur && a.document_version !== cur;
            return (
              <li key={slug} className="report-list-row">
                <div className="report-list-title" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {DOC_HREF[slug] ? <Link href={DOC_HREF[slug]}>{label(slug)}</Link> : label(slug)}
                  {a && !stale && <span className="badge badge-teal" style={{ fontSize: '.7rem' }}>Up to date</span>}
                  {stale && <span className="badge badge-coral" style={{ fontSize: '.7rem' }}>New version published</span>}
                  {!a && <span className="badge badge-coral" style={{ fontSize: '.7rem' }}>Not accepted</span>}
                </div>
                <div className="report-list-meta">
                  {a
                    ? `You accepted version ${a.document_version} on ${formatDate(a.accepted_at)}`
                    : 'No acceptance on record'}
                  {cur ? ` · current version ${cur}` : ''}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {acceptances.length > 1 && (
        <details style={{ marginTop: '1.25rem', maxWidth: 680 }}>
          <summary style={{ cursor: 'pointer', fontSize: '.9rem' }}>
            Full acceptance history ({acceptances.length})
          </summary>
          <ul className="report-list" style={{ margin: '.75rem 0 0' }}>
            {acceptances.map((a) => (
              <li key={a.id} className="report-list-row">
                <div className="report-list-meta">
                  {label(a.document_slug)} v{a.document_version} · {formatDate(a.accepted_at)} ·{' '}
                  {a.context}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
