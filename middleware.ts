import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

// Refreshes the Supabase session cookie on every request and guards /dashboard.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith('/dashboard');
  const isAuthPage = ['/login', '/signup'].some((p) => path === p);

  // NOTE: app/page.tsx is now the real homepage for all visitors (anonymous and
  // authenticated). The previous rewrite to the static public/landing.html
  // marketing page has been removed; that file remains on disk as an archive
  // but is no longer served at "/".

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets + the guest portal (which manages its own access).
    '/((?!_next/static|_next/image|favicon.ico|landing.html|assets/|p/|api/guest|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|woff|woff2|ttf)$).*)',
  ],
};
