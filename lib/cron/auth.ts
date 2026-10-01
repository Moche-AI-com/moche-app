import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

// Shared guard for scheduled routes under /api/cron that are called by the
// Trigger.dev clock tasks. Fails closed when CRON_SECRET is unset, and compares
// in constant time. Callers return 404 on failure so the route is not
// discoverable.
export function isCronAuthorized(req: Request): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.headers.get('authorization') ?? '');
  return received.length === expected.length && timingSafeEqual(expected, received);
}
