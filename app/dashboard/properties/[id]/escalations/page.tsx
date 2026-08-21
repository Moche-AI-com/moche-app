import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PropertyEscalationsPage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  redirect(`/dashboard/properties/${propertyId}/guest-chat`);
}
