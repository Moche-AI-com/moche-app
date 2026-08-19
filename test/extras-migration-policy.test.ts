import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', 'supabase-migrations-EXTRAS-LIFECYCLE.sql'), 'utf8');
const guestOrdersRoute = readFileSync(
  resolve(process.cwd(), 'app/api/guest/[slug]/extras-orders/route.ts'),
  'utf8',
);

describe('extras lifecycle migration access boundaries', () => {
  it('keeps event records append-only and property scoped for hosts', () => {
    expect(migration).toContain('alter table public.extras_order_events enable row level security');
    expect(migration).toContain('create policy extras_order_events_select_members');
    expect(migration).toContain('using (public.can_access_property(property_id))');
    expect(migration).not.toMatch(/create policy extras_order_events_[\s\S]{0,120}for update/i);
    expect(migration).not.toMatch(/create policy extras_order_events_[\s\S]{0,120}for delete/i);
  });

  it('does not give a cross-account caller a property access path', () => {
    expect(migration).toContain('public.can_access_property(property_id)');
    expect(migration).not.toContain('using (true)');
  });

  it('keeps guest history behind the established session scope rather than an anonymous RLS policy', () => {
    expect(migration).not.toMatch(/extras_order_events[\s\S]{0,700}to anon/i);
    expect(guestOrdersRoute).toContain(".eq('property_id', session.propertyId)");
    expect(guestOrdersRoute).toContain(".eq('stay_id', session.stayId)");
  });
});
