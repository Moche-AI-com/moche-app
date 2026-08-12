import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NearbyPlacesPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/dashboard/properties/${(await params).id}/local`);
}
