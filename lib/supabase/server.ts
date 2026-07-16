import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

// Server client bound to the request cookies. Respects RLS as the signed-in user.
// Use inside Server Components, Route Handlers, and Server Actions.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — cookies are read-only there.
            // Session refresh happens in middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
}
