import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { hasPendingLegacyTone, resolveRestrictedTopicKeys, suggestTonePreset } from '@/lib/concierge/tone';
import { getEntitlements } from '@/lib/billing/entitlements';
import { DEFAULT_MODULES, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_GRACE_PERIOD_HOURS, DEFAULT_CONCIERGE_NAME, DEFAULT_RESPONSE_LENGTH, PLANS } from '@/lib/constants';
import { DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { CAPABILITIES, MEMBER_ROLES } from '@/lib/auth/member-capabilities';
import { SettingsForms } from './SettingsForms';
import { DangerZone } from '../DangerZone';

export const dynamic = 'force-dynamic';

function roleLabel(role: string): string {
  return MEMBER_ROLES.find((candidate) => candidate.id === role)?.label ?? role.replace(/_/g, ' ');
}

export default async function PropertySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  if (!access.can.editProperty) {
    return (
      <div>
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>You do not have permission to edit this property.</div>
      </div>
    );
  }

  const { property } = access;
  const supabase = createClient();
  const ent = await getEntitlements(supabase, property.host_account_id);
  const planName = ent.planId ? PLANS[ent.planId].name : null;
  const { data: settings } = await supabase
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, grace_period_hours, review_nudge_enabled, review_nudge_auto, review_url, modules, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, host_language, is_premium_override, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', property.id)
    .maybeSingle();

  const rawModules = (settings?.modules ?? {}) as Record<string, boolean>;
  const normalized = {
    concierge_tone: settings?.concierge_tone ?? null,
    ai_temperature: typeof settings?.ai_temperature === 'number' ? settings.ai_temperature : 0.2,
    confidence_threshold: typeof settings?.confidence_threshold === 'number' ? settings.confidence_threshold : DEFAULT_CONFIDENCE_THRESHOLD,
    grace_period_hours: typeof settings?.grace_period_hours === 'number' ? settings.grace_period_hours : DEFAULT_GRACE_PERIOD_HOURS,
    review_nudge_enabled: settings?.review_nudge_enabled ?? false,
    review_nudge_auto: settings?.review_nudge_auto ?? false,
    review_url: settings?.review_url ?? null,
    modules: { ...DEFAULT_MODULES, ...rawModules } as Record<string, boolean>,
    concierge_name: settings?.concierge_name ?? DEFAULT_CONCIERGE_NAME,
    system_prompt_override: settings?.system_prompt_override ?? null,
    response_length: (settings?.response_length ?? DEFAULT_RESPONSE_LENGTH) as string,
    restricted_topics: settings?.restricted_topics ?? null,
    restricted_topic_keys: resolveRestrictedTopicKeys(settings?.restricted_topic_keys) as string[],
    // Pending only while the host has an un-answered legacy tone note; drives the
    // confirmation banner and, until answered, the live guest prompt.
    legacy_tone_note: settings?.legacy_tone_note ?? null,
    legacy_tone_pending: hasPendingLegacyTone({
      legacyToneNote: settings?.legacy_tone_note,
      legacyToneAckAt: settings?.legacy_tone_ack_at,
    }),
    suggested_tone_preset: suggestTonePreset(settings?.legacy_tone_note) as string,
    language: settings?.language ?? 'auto',
    host_language: settings?.host_language ?? DEFAULT_HOST_LANGUAGE,
    is_premium_override: settings?.is_premium_override ?? false,
  };

  // Premium concierge controls unlock on a paid plan OR via the per-property override.
  const premiumUnlocked = ent.conciergeCustomization || normalized.is_premium_override;

  // Assigned team — a read-only mirror of Profile → User management, scoped to
  // this property. Owner-only, and read through the service role for the same
  // reason as the roster page: member emails are sensitive account data.
  type AssignedMember = { profileId: string; email: string; name: string | null; role: string; labels: string[] };
  let team: AssignedMember[] = [];
  if (access.isOwner && hasServiceRole()) {
    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from('property_members')
      .select('profile_id, role, can_edit_brain, can_reply_guests, can_receive_escalations, can_resolve_maintenance, can_view_analytics')
      .eq('property_id', property.id);
    const profileIds = [...new Set((memberships ?? []).map((membership) => membership.profile_id))];
    const { data: profiles } = profileIds.length
      ? await admin.from('profiles').select('id, email, full_name').in('id', profileIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    team = (memberships ?? [])
      .flatMap((membership) => {
        const profile = profileById.get(membership.profile_id);
        if (!profile) return [];
        const labels = CAPABILITIES.filter((capability) => membership[capability.key]).map((capability) => capability.label);
        return [{
          profileId: membership.profile_id,
          email: profile.email,
          name: profile.full_name?.trim() || null,
          role: membership.role,
          labels,
        }];
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  return (
    <div>
      <div style={{ margin: '.5rem 0 1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Settings</h1>
        <p className="faint" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
          {property.display_name} — branding, concierge voice, portal modules, and access.
        </p>
      </div>
      <SettingsForms property={property} settings={normalized} premiumUnlocked={premiumUnlocked} reviewUnlocked={ent.reviewNudge} planName={planName} />

      {/* Assigned team: read-only here by design — roles, actions, and invites
          are all managed in Profile → User management, so there is exactly one
          place to change who can do what. The old Team chat permissions panel
          was removed: those capabilities already live on the member there. */}
      {access.isOwner && (
        <section className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }} aria-labelledby="assigned-team-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 id="assigned-team-heading" style={{ fontSize: '1.05rem', margin: 0 }}>Assigned team</h2>
              <p className="muted" style={{ fontSize: '.84rem', margin: '.35rem 0 0', maxWidth: '44rem' }}>
                People who can help run {property.display_name}. Access itself is managed in Profile → User management.
              </p>
            </div>
            <Link href="/dashboard/profile/user-management" className="btn btn-ghost btn-sm">Manage team</Link>
          </div>
          {team.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.6rem' }}>
              {team.map((member) => (
                <li key={member.profileId} className="card-2" style={{ padding: '.8rem .9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '.9rem' }}>{member.name ?? member.email}</strong>
                    <span className="badge">{roleLabel(member.role)}</span>
                  </div>
                  {member.name && <p className="faint" style={{ fontSize: '.78rem', margin: '.2rem 0 0' }}>{member.email}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.55rem' }}>
                    {member.labels.length > 0 ? (
                      member.labels.map((label) => (
                        <span key={label} className="badge badge-teal" style={{ fontSize: '.67rem' }}>{label}</span>
                      ))
                    ) : (
                      <span className="faint" style={{ fontSize: '.82rem' }}>No actions enabled</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
              Only you have access to this property right now. Invite a co-host, cleaner, or support hand from User management and they will appear here.
            </p>
          )}
        </section>
      )}

      {/* Permanent delete is owner-only — the main account holder, not anyone
          else with property access. deletePropertyAction re-checks isOwner
          server-side; this gate is the UI mirror of it. */}
      {access.isOwner && (
        <div style={{ marginTop: '1.5rem' }}>
          <DangerZone propertyId={property.id} propertyName={property.display_name} />
        </div>
      )}
    </div>
  );
}
