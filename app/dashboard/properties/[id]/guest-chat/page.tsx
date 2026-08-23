import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Guest chat merged into the Stays tab so stay management and that stay's
// conversation live in one view. Preserve the ?stay= deep-link param.
export default async function GuestChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ stay?: string }>;
}) {
  const propertyId = (await params).id;
  const stay = (await searchParams)?.stay;
  redirect(`/dashboard/properties/${propertyId}/stays${stay ? `?stay=${encodeURIComponent(stay)}` : ''}`);
}
