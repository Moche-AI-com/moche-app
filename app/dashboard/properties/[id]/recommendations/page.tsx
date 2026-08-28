import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Retired 2026-08-28: Local Recs consolidated into /local (canonical places + one
// manager). This path stays as a permanent redirect so old links and bookmarks land
// in the right place; the tables behind it keep feeding the guest fallback read.
export default async function RecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/dashboard/properties/${(await params).id}/local`);
}
