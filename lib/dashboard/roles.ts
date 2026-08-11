export type DashboardRole = 'owner' | 'admin' | 'member';

export interface DashboardRoleContext {
  userId: string;
  accountOwnerId: string;
  /** Internal account administration claim supplied by the authenticated context. */
  isAdmin?: boolean;
}

/**
 * Keeps dashboard role presentation limited to the three v1 presets. Ownership
 * always wins, even when an owner also holds an admin claim.
 */
export function roleFor(ctx: DashboardRoleContext): DashboardRole {
  if (ctx.userId === ctx.accountOwnerId) return 'owner';
  return ctx.isAdmin ? 'admin' : 'member';
}

export function roleLabel(ctx: DashboardRoleContext): 'Owner' | 'Admin' | 'Member' {
  const role = roleFor(ctx);
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';
}
