import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ExtrasManager, type ExtraRow } from './ExtrasManager';

export const dynamic = 'force-dynamic';

export default async function ExtrasPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const { property } = access;
  const supabase = createClient();

  const { data: offers } = await supabase
    .from('guest_extras')
    .select('id, title, description, price_text, cta_label, active, sort_order, category, is_favorite, max_quantity')
    .eq('property_id', property.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1.5rem' }}>Enhancements</h1>
      <ExtrasManager propertyId={property.id} offers={(offers ?? []) as ExtraRow[]} />
    </div>
  );
}
