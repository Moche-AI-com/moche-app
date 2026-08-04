import { NextResponse } from 'next/server';
import { log } from '@/lib/log';

// Receiver for Content-Security-Policy-Report-Only violations.
//
// The CSP in next.config.mjs ships report-only, so this endpoint is how we learn which
// legitimate sources are missing from the policy before we switch it to enforcing.
//
// Design notes:
//  - Unauthenticated by necessity: the browser posts these with no session, and reports
//    can arrive from the guest portal where there is no logged-in user at all.
//  - Because it is unauthenticated it is also spammable, so it does the absolute minimum:
//    parse, clamp, log a few known-safe fields, and return 204. No database writes, no
//    outbound calls, nothing an attacker could amplify.
//  - Only an allowlist of fields is logged, and the shared redacting logger strips
//    anything sensitive that slips into a URL (tokens, emails, long digit runs).
//  - Never throws. A malformed report must not produce a 500.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports are small. Anything larger is not a real browser report.
const MAX_BODY_BYTES = 16 * 1024;

// Trim long URLs so a pathological report cannot bloat the log line.
function clamp(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.text();
    if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }

    const parsed: unknown = JSON.parse(raw);

    // Two wire formats exist in the wild:
    //   report-uri  → { "csp-report": { ... } }
    //   report-to   → [ { "type": "csp-violation", "body": { ... } }, ... ]
    const reports: Array<Record<string, unknown>> = [];
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry && typeof entry === 'object') {
          const body = (entry as Record<string, unknown>).body;
          if (body && typeof body === 'object') reports.push(body as Record<string, unknown>);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const legacy = (parsed as Record<string, unknown>)['csp-report'];
      if (legacy && typeof legacy === 'object') reports.push(legacy as Record<string, unknown>);
    }

    // Cap how many we log from one request.
    for (const r of reports.slice(0, 10)) {
      log.warn('csp_violation', {
        // report-uri uses kebab-case keys; report-to uses camelCase. Accept either.
        directive: clamp(r['effective-directive'] ?? r['violated-directive'] ?? r.effectiveDirective, 60),
        blockedUri: clamp(r['blocked-uri'] ?? r.blockedURL),
        documentUri: clamp(r['document-uri'] ?? r.documentURL),
        disposition: clamp(r.disposition, 20),
        statusCode: typeof r['status-code'] === 'number' ? r['status-code'] : undefined,
      });
    }
  } catch {
    // Malformed or non-JSON body: ignore. Reporting is best-effort telemetry.
  }

  // 204 with no body is the conventional response; browsers ignore the payload anyway.
  return new NextResponse(null, { status: 204 });
}
