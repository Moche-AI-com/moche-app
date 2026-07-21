import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getGuestSession, guestSessionCookieOptions } from '@/lib/guest/session';
import { GUEST_SESSION_COOKIE, DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Silent re-auth. If the opaque cookie still maps to a valid session, re-issue the SAME
// cookie value with its expiry reset to the session's expiresAt (checkout + grace). It never
// extends past that and never rotates the DB row.
export async function POST() {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const token = cookies().get(GUEST_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  // Session expiry mirrors the DB row: checkout + grace. Never extends past it.
  const expiresAt = new Date(new Date(session.checkOut).getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  cookies().set({ ...guestSessionCookieOptions(expiresAt), value: token });
  return NextResponse.json({ ok: true });
}
