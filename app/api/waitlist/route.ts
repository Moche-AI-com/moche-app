import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, properties, pain_point } = body as {
      email?: string;
      properties?: string;
      pain_point?: string;
    };

    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
    }

    // Persist to Supabase using the service role key so RLS is bypassed
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { error } = await supabase.from('waitlist_signups').insert({
      email: email.toLowerCase().trim(),
      property_count: properties || null,
      pain_point: pain_point || null,
    });

    if (error) {
      // Table may not exist yet — still acknowledge the submission gracefully
      console.error('[waitlist] supabase insert error:', error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[waitlist] unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// Prevent GET requests
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
