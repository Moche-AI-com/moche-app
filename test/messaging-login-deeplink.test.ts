import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ids } from './helpers/messaging-db';
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
import { middleware } from '../middleware';

it('preserves the exact message locator through a required host login', async () => {
  const destination = `/dashboard/properties/${ids.property}/stays/${ids.stay}/conversations/${ids.conversation}?message=${ids.message}`;
  const response = await middleware(new NextRequest(`https://example.test${destination}`));
  const location = new URL(response.headers.get('location')!);
  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('next')).toBe(destination);
  expect([...location.searchParams.keys()]).toEqual(['next']);
});
