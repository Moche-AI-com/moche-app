import { redirect } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { GuestChatInbox } from './GuestChatInbox';

export const dynamic = 'force-dynamic';

export default async function GuestChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ stay?: string }>;
}) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!access.isOwner && !access.can.replyGuests) {
    redirect(`/dashboard/properties/${propertyId}`);
  }

  const stayId = (await searchParams)?.stay ?? null;
  const canAnnounce = access.isOwner || (access.member as any)?.can_send_announcements === true;

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.25rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{access.property.display_name}</p>
        <h1 style={{ margin: '.25rem 0' }}>Guest Chat</h1>
        <p className="muted" style={{ margin: 0 }}>
          Answer guest messages, resolve AI escalations, and send stay announcements.
        </p>
      </div>
      <GuestChatInbox propertyId={propertyId} stayId={stayId} canAnnounce={canAnnounce} />
    </main>
  );
}
