import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ExtrasManager, type ExtraRow } from './ExtrasManager';
import { ExtrasOrdersClient, type ExtrasOrderRow } from '@/app/dashboard/extras/ExtrasOrdersClient';

export const dynamic = 'force-dynamic';

export default async function ExtrasPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  const { property } = access;
  const supabase = createClient();

  const { data: offers } = await supabase
    .from('guest_extras')
    .select('id, title, description, price_text, cta_label, active, sort_order, category, is_favorite, max_quantity, kind, unit_label, option_label, options, details')
    .eq('property_id', property.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const { data: orders } = await supabase
    .from('extras_orders')
    .select('id, property_id, stay_id, escalation_id, item_title, item_price_text, quantity, guest_note, host_note, fulfillment_status, request_number, quoted_amount_cents, quote_currency, scheduled_for, declined_reason, expires_at, created_at')
    .eq('property_id', property.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const canManage = access.can.editProperty || access.can.editBrain;

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1.5rem' }}>Enhancements</h1>
      <ExtrasManager propertyId={property.id} offers={(offers ?? []) as ExtraRow[]} />
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 .35rem' }}>Guest requests</h2>
        <p className="muted" style={{ fontSize: '.88rem', margin: '0 0 1rem' }}>
          Review the current state and arrange any payment directly with the guest. Moche does not charge guest cards.
        </p>
        <ExtrasOrdersClient
          orders={(orders ?? []) as ExtrasOrderRow[]}
          propertyNames={{ [property.id]: property.display_name }}
          manageableProperties={canManage ? [property.id] : []}
        />
      </section>
    </div>
  );
}
