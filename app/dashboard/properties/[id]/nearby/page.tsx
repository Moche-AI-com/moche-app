import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function NearbyPlacesPage({ params }: { params: { id: string } }) {
  permanentRedirect(`/dashboard/properties/${params.id}/local`);
}
