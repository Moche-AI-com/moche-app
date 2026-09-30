import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unsubscribeGuestEmail } from '@/lib/guest/email-alerts';
import { guestEmailPage } from '@/lib/guest/email-alerts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  return html(guestEmailPage({
    title: 'Stop email alerts',
    body: 'Stop Moche-AI emails about host replies for this stay?',
    action: { url: `/api/guest/email/unsubscribe?token=${encodeURIComponent(token)}`, token, label: 'Stop emails' },
  }));
}

// Handles both the page button and RFC 8058 one-click unsubscribe from mail
// providers (List-Unsubscribe-Post), which POST to the header URL.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const raw = form?.get('token');
  const token = (typeof raw === 'string' ? raw : '') || url.searchParams.get('token') || '';
  const ok = await unsubscribeGuestEmail(createAdminClient(), token);
  if (!ok) return html(guestEmailPage({ title: 'Link not valid', body: 'This unsubscribe link is not valid.' }), 400);
  return html(guestEmailPage({ title: 'Emails stopped', body: "You won't get any more email alerts for this stay. Replies still appear in your guest portal." }));
}
