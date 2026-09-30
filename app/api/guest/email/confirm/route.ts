import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmGuestEmail } from '@/lib/guest/email-alerts';
import { guestEmailPage } from '@/lib/guest/email-alerts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

// GET only renders a button: email link scanners prefetch GET URLs, so the
// single-use token is consumed on the guest's explicit POST, never on GET.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!token) return html(guestEmailPage({ title: 'Link not valid', body: 'This confirmation link is incomplete. Request a new one from your guest portal.' }), 400);
  return html(guestEmailPage({
    title: 'Confirm email alerts',
    body: 'Tap below so Moche-AI can email you when your host replies during this stay.',
    action: { url: '/api/guest/email/confirm', token, label: 'Confirm email alerts' },
  }));
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const raw = form?.get('token');
  const token = typeof raw === 'string' ? raw : '';
  const result = await confirmGuestEmail(createAdminClient(), token);
  if (!result.ok) {
    return html(guestEmailPage({ title: 'Link expired', body: 'This link has expired or was already used. Request a new one from your guest portal.' }), 400);
  }
  return html(guestEmailPage({
    title: "You're all set",
    body: "We'll email you when your host replies. Their reply will also appear in your guest portal.",
    link: result.slug ? { href: `/g/${encodeURIComponent(result.slug)}`, label: 'Back to your guest portal' } : undefined,
  }));
}
