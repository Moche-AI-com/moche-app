import type { ReactNode } from 'react';
import Link from 'next/link';

export default async function BrainLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <nav aria-label="Manage Brain tools" className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <strong>Appliances</strong>
            <p className="faint" style={{ margin: '.35rem 0 0' }}>
              Add devices, review manuals, and approve guest guidance and answers.
            </p>
          </div>
          <Link className="btn btn-primary btn-sm" href={`/dashboard/properties/${id}/appliances`}>
            Manage appliances →
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
