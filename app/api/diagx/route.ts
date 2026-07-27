// TEMPORARY DIAGNOSTIC ROUTE — remove after debugging the auth-email send failure.
// Guarded by a shared token so it is not publicly abusable. Does NOT log or return
// the secret itself, only its presence/length/prefix and the raw Resend response.
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'diag-9f3a71-resend-check';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const key = process.env.RESEND_API_KEY ?? '';
  const info: Record<string, unknown> = {
    key_present: key.length > 0,
    key_len: key.length,
    key_prefix: key.slice(0, 3),
    node_env: process.env.NODE_ENV,
    app_url: process.env.APP_URL ?? null,
  };

  if (!key) {
    return NextResponse.json({ ...info, verdict: 'EMPTY_KEY' });
  }

  // Validate key via read-only domains list.
  try {
    const dres = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    info.domains_status = dres.status;
    info.domains_body = (await dres.text()).slice(0, 1200);
  } catch (e) {
    info.domains_error = String(e);
  }

  // Attempt the exact send the app performs.
  const to = req.nextUrl.searchParams.get('to') ?? 'diag@example.com';
  try {
    const sres = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Moche.AI <noreply@moche-ai.com>',
        to,
        subject: 'Confirm your Moche.AI email',
        html: '<p>diag</p>',
        text: 'diag',
      }),
    });
    info.send_status = sres.status;
    info.send_body = (await sres.text()).slice(0, 1200);
  } catch (e) {
    info.send_error = String(e);
  }

  return NextResponse.json(info);
}
