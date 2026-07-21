import Link from 'next/link';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateSessionToken, hashSessionToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { PROPERTY_LINK_TTL_DAYS, PROPERTY_LINK_DEFAULT_MAX_REDEMPTIONS } from '@/lib/constants';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

// QR sourcing: this page MINTS a fresh reusable property link server-side on each load
// (kind='property', require_otp=true) and renders its QR. We can't rebuild a QR from an
// existing link because only the token_hash is stored (never the raw token), so a freshly
// minted token is the clean, honest source. Property links are OTP-gated and TTL-bounded.
function baseUrl(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return publicEnv.appUrl.replace(/\/$/, '');
}

export default async function WelcomeCardPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const { property } = access;
  const admin = createAdminClient();
  const user = await getUser();

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + PROPERTY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await admin.from('guest_access_links').insert({
    property_id: property.id,
    stay_id: null,
    token_hash: tokenHash,
    kind: 'property',
    expires_at: expiresAt,
    max_redemptions: PROPERTY_LINK_DEFAULT_MAX_REDEMPTIONS,
    require_otp: true,
    created_by: user?.id ?? null,
  } as never);

  const url = `${baseUrl()}/stay/${property.slug}?k=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 640, margin: 1 });
  const location = [property.city, property.region, property.country].filter(Boolean).join(', ');

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .welcome-card { box-shadow: none !important; border: none !important; margin: 0 !important; }
        }
        .welcome-card { color: #0b1220; }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Link href={`/dashboard/properties/${property.id}`} className="muted" style={{ fontSize: '.85rem' }}>← {property.display_name}</Link>
        <PrintButton />
      </div>

      <div
        className="welcome-card"
        style={{
          maxWidth: 560,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          border: '1px solid #e6e9ef',
        }}
      >
        <div style={{ fontSize: '.8rem', letterSpacing: '.18em', textTransform: 'uppercase', color: '#12B5AD', fontWeight: 700 }}>Moche.AI</div>
        <h1 style={{ fontSize: '1.9rem', margin: '.6rem 0 .2rem', color: '#0b1220' }}>Welcome to {property.display_name}</h1>
        {location && <p style={{ color: '#5b6472', fontSize: '.9rem', marginBottom: '1.5rem' }}>{location}</p>}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Scan to unlock your concierge" style={{ width: 260, height: 260, margin: '0 auto', display: 'block' }} />

        <h2 style={{ fontSize: '1.15rem', margin: '1.5rem 0 .4rem', color: '#0b1220' }}>Scan to unlock your concierge</h2>
        <p style={{ color: '#5b6472', fontSize: '.9rem', maxWidth: 380, margin: '0 auto' }}>
          Point your phone camera at the code. Verify once with the email or phone on your
          booking to get WiFi, check-in details, local tips, and 24/7 answers.
        </p>

        <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e6e9ef', color: '#8a93a3', fontSize: '.75rem' }}>
          Built in Somerville, MA
        </div>
      </div>
    </div>
  );
}
