import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type HostAccount = Database['public']['Tables']['host_accounts']['Row'];
type Property = Database['public']['Tables']['properties']['Row'];
type PropertyMember = Database['public']['Tables']['property_members']['Row'];

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export interface SessionContext {
  user: User;
  profile: Profile;
  account: HostAccount;
  // Internal founder/staff claim (profiles.is_admin). Set only via service
  // role -- see prevent_is_admin_self_update trigger in supabase-migrations-RBAC.sql.
  isFounder: boolean;
}

// Loads the signed-in user, their profile, and the host account they own.
// The handle_new_user trigger guarantees these exist after signup.
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return null;

  // Owned account first; fall back to any account membership.
  const { data: account } = await supabase
    .from('host_accounts')
    .select('*')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!account) {
    const { data: viaMember } = await supabase
      .from('host_accounts')
      .select('*')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (!viaMember) return null;
    return { user, profile, account: viaMember, isFounder: !!profile.is_admin };
  }

  return { user, profile, account, isFounder: !!profile.is_admin };
});

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return ctx;
}

// Pre-launch access gate. Until the public launch (January 1, 2027), accounts created
// on or after the cutoff are held on /welcome instead of reaching the tool. This applies
// to direct signups AND to members invited by existing testers (an invite creates a
// brand-new profile, so invitees are "new users" for gate purposes). Founders and staff
// (profiles.is_admin) always bypass. Existing tester accounts predate the cutoff and keep
// full access. To open the doors, point the dashboard layout back at requireSession and
// delete this guard — nothing else references the cutoff.
export const LAUNCH_GATE_CUTOFF_ISO = '2026-08-21T00:00:00.000Z';

export async function requireLaunchAccess(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const isNewUser = new Date(ctx.profile.created_at) >= new Date(LAUNCH_GATE_CUTOFF_ISO);
  if (!ctx.isFounder && isNewUser) redirect('/welcome');
  return ctx;
}

// Pure guard, deliberately not built on the cached getSessionContext so it
// can be unit-tested against plain constructed objects. Reserved for WS-8
// (HQ console) route/action gating -- no caller yet in this PR.
export function requireFounder(ctx: SessionContext | null): SessionContext {
  if (!ctx || !ctx.isFounder) redirect('/dashboard');
  return ctx;
}

export interface PropertyAccess {
  property: Property;
  member: PropertyMember | null; // null when the user is the account owner (implicit full access)
  isOwner: boolean;
  can: {
    editBrain: boolean;
    replyGuests: boolean;
    receiveEscalations: boolean;
    resolveMaintenance: boolean;
    viewAnalytics: boolean;
    editProperty: boolean;
    manageBilling: boolean;
    manageCoHosts: boolean;
  };
}

// Loads a property the user can access (RLS enforces this) plus their effective permissions.
// Returns null if the property is not visible to the user.
export async function getPropertyAccess(propertyId: string): Promise<PropertyAccess | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property) return null;

  const isOwner = property.host_account_id === ctx.account.id && ctx.account.owner_id === ctx.user.id;

  const { data: member } = await supabase
    .from('property_members')
    .select('*')
    .eq('property_id', propertyId)
    .eq('profile_id', ctx.user.id)
    .maybeSingle();
  const can = isOwner
    ? {
        editBrain: true,
        replyGuests: true,
        receiveEscalations: true,
        resolveMaintenance: true,
        viewAnalytics: true,
        editProperty: true,
        manageBilling: true,
        manageCoHosts: true,
      }
    : {
        editBrain: !!member?.can_edit_brain,
        replyGuests: !!member?.can_reply_guests,
        receiveEscalations: !!member?.can_receive_escalations,
        resolveMaintenance: !!member?.can_resolve_maintenance,
        viewAnalytics: !!member?.can_view_analytics,
        editProperty: false, // co-hosts cannot edit core property settings
        manageBilling: false,
        manageCoHosts: false,
      };

  return { property, member: member ?? null, isOwner, can };
}

export async function requirePropertyAccess(propertyId: string): Promise<PropertyAccess> {
  const access = await getPropertyAccess(propertyId);
  if (!access) redirect('/dashboard');
  return access;
}
