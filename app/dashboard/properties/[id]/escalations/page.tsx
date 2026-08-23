import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Legacy route. Escalation handling lives inside the merged Stays tab now
// (per-stay conversation view); keep this one-hop redirect for bookmarked links.
export default async function PropertyEscalationsPage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  redirect(`/dashboard/properties/${propertyId}/stays`);
}
