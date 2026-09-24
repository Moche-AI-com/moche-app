import { timingSafeEqual } from 'node:crypto';
import { openaiProvider } from '@/lib/ai/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = request.headers.get('authorization');
  if (!received?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(received.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  }

  try {
    const result = await openaiProvider.embedWithUsage!(
      ['moche-ai-synthetic-embedding-health-v1'],
    );
    const vector = result.vectors[0];
    const valid = result.vectors.length === 1
      && Array.isArray(vector)
      && vector.length === 1536
      && vector.every(Number.isFinite)
      && vector.some((value) => value !== 0);

    if (!valid) {
      return Response.json({ ok: false, reason: 'invalid_embedding_dimension_or_values' },
        { status: 503, headers });
    }
    return Response.json({ ok: true, model: result.model, dimension: vector.length },
      { status: 200, headers });
  } catch {
    return Response.json({ ok: false, reason: 'embedding_provider_unavailable' },
      { status: 503, headers });
  }
}
