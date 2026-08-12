import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

// Server client bound to the request cookies. Respects RLS as the signed-in user.
// Use inside Server Components, Route Handlers, and Server Actions.
//
// Next 16 made cookies() async. This function stays SYNCHRONOUS on purpose:
// @supabase/ssr accepts async cookie adapters, so awaiting inside getAll/setAll
// confines the change to this file instead of forcing `await` onto all 87
// createClient() call sites. Eighty-seven mechanical edits across every auth and
// data path is a far larger blast radius than two awaits here, and a missed one
// would silently produce an unauthenticated client rather than a type error.
export function createClient() {
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        async getAll() {
          return (await cookies()).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const cookieStore = await cookies();
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
