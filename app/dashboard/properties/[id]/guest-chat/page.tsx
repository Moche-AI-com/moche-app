import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Guest chat lives in the Property Inbox now — one page holding every
// conversation for the property, with Active/Past stay filtering. Preserve the
// ?stay= deep-link param: it narrows the inbox to that party.
export default async function GuestChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ stay?: string }>;
}) {
  const propertyId = (await params).id;
  const stay = (await searchParams)?.stay;
  redirect(`/dashboard/properties/${propertyId}/inbox${stay ? `?stay=${encodeURIComponent(stay)}` : ''}`);
}
