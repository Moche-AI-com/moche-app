// Go-live readiness (read-only) — Manage Brain redesign, slice 1.
//
// Answers the only two questions a host has before publishing:
//   1. What MUST be answered before this portal can go live? (hard-block fields)
//   2. How close is the brain overall?                        (canonical registry %)
//
// Renders the same number and the same hard-block list the publish gate reads
// (loadCompleteness -> canPublish), so what the host sees here cannot drift
// from enforcement. Deliberately read-only: this page reports; Manage Brain is
// where answers get filed.
//
// Additive route — no existing file is modified. Direct URL:
// /dashboard/properties/<id>/brain/go-live

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { loadCompleteness } from '@/lib/brain/values';
import {
  COMPLETENESS_SHIP_THRESHOLD,
  HARD_BLOCK_FIELD_IDS,
  REGISTRY_FIELDS,
} from '@/lib/brain/completeness';

export const dynamic = 'force-dynamic';

function blockedReasonText(reason: string | null): string {
  switch (reason) {
    case 'hard_blocks_outstanding':
      return 'required answers are missing';
    case 'below_threshold':
      return `the brain score is below the ${COMPLETENESS_SHIP_THRESHOLD}% line`;
    case 'both':
      return 'required answers are missing and the score is below the publish line';
    default:
      return reason ?? 'the publish gate is not satisfied';
  }
}

export default async function GoLivePage({ params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  // Redirects unless the signed-in host can access this property.
  await requirePropertyAccess(propertyId);

  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('display_name, status')
    .eq('id', propertyId)
    .maybeSingle();
  if (!property) notFound();

  const completeness = await loadCompleteness(supabase, propertyId);
  const outstandingIds = new Set(completeness.hardBlocksOutstanding.map((g) => g.fieldId));
  const hardBlockIds: ReadonlySet<string> = new Set(HARD_BLOCK_FIELD_IDS);
  const hardBlockFields = REGISTRY_FIELDS.filter((f) => hardBlockIds.has(f.field_id));
  const otherGaps = completeness.gaps.filter((g) => !g.hardBlock);
  const shownGaps = otherGaps.slice(0, 20);

  const ready = completeness.canPublish;
  const statusColor = ready ? '#16a34a' : '#dc2626';
  const pctCapped = Math.max(0, Math.min(100, completeness.pct));
  const threshold = Math.max(0, Math.min(100, COMPLETENESS_SHIP_THRESHOLD));

  return (
    <section style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <p style={{ margin: 0 }}>
        <Link href={`/dashboard/properties/${propertyId}/brain`}>← Back to Manage Brain</Link>
      </p>

      <h1 style={{ fontSize: '1.4rem', margin: '0.75rem 0 0.25rem' }}>Go-live readiness</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        {property.display_name} · status: {property.status}
      </p>

      <div
        style={{
          marginTop: '1.25rem',
          padding: '1rem 1.25rem',
          border: `1px solid ${statusColor}`,
          borderLeftWidth: '4px',
          borderRadius: '12px',
        }}
      >
        <strong>{ready ? 'Ready to publish' : 'Not ready to publish'}</strong>
        <p style={{ margin: '0.35rem 0 0', opacity: 0.85 }}>
          {ready
            ? 'Every required answer is in and the score clears the publish line.'
            : `Before this portal can go live: ${blockedReasonText(completeness.blockedReason ?? null)}.`}
        </p>
      </div>

      <div
        style={{
          marginTop: '1.25rem',
          padding: '1rem 1.25rem',
          border: '1px solid rgba(128,128,128,.35)',
          borderRadius: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 700 }}>{completeness.pct}%</span>
          <span style={{ opacity: 0.7 }}>brain score — {threshold}% required to publish</span>
        </div>
        <div
          style={{
            position: 'relative',
            height: '8px',
            marginTop: '0.75rem',
            backgroundColor: 'rgba(128,128,128,.25)',
            borderRadius: '999px',
          }}
        >
          <div
            style={{
              width: `${pctCapped}%`,
              height: '100%',
              backgroundColor: '#33E6D4',
              borderRadius: '999px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${threshold}%`,
              top: '-3px',
              width: '2px',
              height: '14px',
              backgroundColor: '#dc2626',
            }}
          />
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '.8rem', opacity: 0.7 }}>
          The red marker is the {threshold}% publish line. This is the same registry completeness the
          Manage Brain header and the publish gate read — there is no second number.
        </p>
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '2rem 0 0.25rem' }}>Required before go-live</h2>
      <p style={{ margin: 0, opacity: 0.7, fontSize: '.85rem' }}>
        The publish gate refuses to go live while any of these is missing. If one genuinely does not
        apply — no parking, for example — mark it under “What this place has” and it stops counting.
      </p>
      <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
        {hardBlockFields.map((f) => {
          const missing = outstandingIds.has(f.field_id);
          return (
            <li
              key={f.field_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0',
                borderBottom: '1px solid rgba(128,128,128,.2)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  flexShrink: 0,
                  backgroundColor: missing ? '#dc2626' : '#16a34a',
                }}
              />
              <span style={{ flex: 1 }}>
                {f.label}
                <span style={{ opacity: 0.6, fontSize: '.8rem' }}> · {f.domain.replace(/_/g, ' ')}</span>
              </span>
              <span style={{ fontSize: '.8rem', opacity: 0.75 }}>
                {missing ? 'Missing — blocks go-live' : 'Answered or N/A'}
              </span>
            </li>
          );
        })}
      </ul>

      <h2 style={{ fontSize: '1.05rem', margin: '2rem 0 0.25rem' }}>Raise the score</h2>
      <p style={{ margin: 0, opacity: 0.7, fontSize: '.85rem' }}>
        Not blockers — each one improves guest answers and lifts the score.
      </p>
      {shownGaps.length === 0 ? (
        <p style={{ opacity: 0.75 }}>
          Nothing outstanding. The brain is as complete as the registry can measure.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
          {shownGaps.map((g) => (
            <li
              key={g.fieldId}
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid rgba(128,128,128,.15)',
              }}
            >
              <span style={{ flex: 1 }}>{g.label}</span>
              <span style={{ opacity: 0.6, fontSize: '.8rem' }}>{g.domain.replace(/_/g, ' ')}</span>
            </li>
          ))}
        </ul>
      )}
      {otherGaps.length > shownGaps.length ? (
        <p style={{ fontSize: '.8rem', opacity: 0.7 }}>
          + {otherGaps.length - shownGaps.length} more — file answers on the Manage Brain page.
        </p>
      ) : null}

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem 1.25rem',
          border: '1px solid rgba(128,128,128,.25)',
          borderRadius: '12px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '.9rem' }}>How this number works</h3>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', opacity: 0.85, fontSize: '.85rem' }}>
          <li>One canonical score — the publish gate and the Manage Brain header read this same computation.</li>
          <li>Never scored on what the property does not have — N/A features leave the denominator entirely.</li>
          <li>Required answers are enforced at publish time; everything else only moves the score.</li>
          <li>This page is read-only. Answers are filed on the Manage Brain page.</li>
        </ul>
      </div>
    </section>
  );
}
