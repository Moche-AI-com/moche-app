'use client';

import { memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAPABILITIES,
  DEFAULT_CAPABILITIES_FOR_ROLE,
  MEMBER_ROLES,
  type CapabilitySet,
  type InvitableRole,
} from '@/lib/auth/member-capabilities';
import { FormMessage, SubmitButton } from '@/components/FormFeedback';
import {
  inviteMemberAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  updateMemberCapabilitiesAction,
  type MemberActionState,
} from './actions';

export interface PropertyOption {
  id: string;
  name: string;
}

export interface ManagedMember {
  profileId: string;
  email: string;
  name: string | null;
  role: string;
  capabilities: CapabilitySet;
  properties: PropertyOption[];
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  capabilities: CapabilitySet;
  propertyIds: string[];
}

const EMPTY_STATE: MemberActionState = {};

const EMPTY_CAPABILITY_SET: CapabilitySet = {
  can_edit_brain: false,
  can_reply_guests: false,
  can_receive_escalations: false,
  can_resolve_maintenance: false,
  can_view_analytics: false,
};

// Built once instead of per-render per-row.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(date: string): string {
  return dateFormatter.format(new Date(date));
}

function labelForRole(role: string): string {
  return MEMBER_ROLES.find((candidate) => candidate.id === role)?.label ?? role.replace(/_/g, ' ');
}

function buildCapabilitySet(enabled: boolean): CapabilitySet {
  return CAPABILITIES.reduce<CapabilitySet>(
    (set, capability) => ({ ...set, [capability.key]: enabled }),
    { ...EMPTY_CAPABILITY_SET },
  );
}

/* -------------------------------------------------------------------------- */
/*  Presentational pieces                                                      */
/* -------------------------------------------------------------------------- */

const CapabilityChips = memo(function CapabilityChips({ capabilities }: { capabilities: CapabilitySet }) {
  const labels = useMemo(
    () => CAPABILITIES.filter((c) => capabilities[c.key]).map((c) => c.label),
    [capabilities],
  );
  return (
    <div className="um-capability-chips" aria-label="Allowed actions">
      {labels.length > 0 ? (
        labels.map((label) => (
          <span key={label} className="badge badge-teal">
            {label}
          </span>
        ))
      ) : (
        <span className="faint" style={{ fontSize: '.82rem' }}>
          No actions enabled
        </span>
      )}
    </div>
  );
});

const CapabilityControls = memo(function CapabilityControls({
  capabilities,
  onChange,
}: {
  capabilities: CapabilitySet;
  onChange: (next: CapabilitySet) => void;
}) {
  const masterRef = useRef<HTMLInputElement>(null);
  const enabled = useMemo(
    () => CAPABILITIES.reduce((count, c) => count + (capabilities[c.key] ? 1 : 0), 0),
    [capabilities],
  );
  const allActions = enabled === CAPABILITIES.length;

  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = enabled > 0 && !allActions;
  }, [allActions, enabled]);

  return (
    <fieldset className="um-capability-fieldset">
      <legend>Actions they can take</legend>
      <label className="um-master-toggle">
        <input
          ref={masterRef}
          type="checkbox"
          checked={allActions}
          onChange={(event) => onChange(buildCapabilitySet(event.target.checked))}
          aria-label="All actions"
        />
        <span>
          <strong>All actions</strong>
          <small>Give every available action at once.</small>
        </span>
      </label>
      <div className="um-toggle-grid">
        {CAPABILITIES.map((capability) => (
          <label key={capability.key} className="um-toggle">
            <input
              type="checkbox"
              checked={capabilities[capability.key]}
              onChange={(event) => onChange({ ...capabilities, [capability.key]: event.target.checked })}
            />
            <span>{capability.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
});

/** Shared inline-confirm pattern for destructive actions (revoke / remove). */
function ConfirmButton({
  label,
  confirmLabel,
  ariaLabel,
  pending,
}: {
  label: string;
  confirmLabel: string;
  ariaLabel: string;
  pending?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <div className="um-inline-confirm" role="group" aria-label={ariaLabel}>
      <span>{label}</span>
      <SubmitButton className="btn btn-danger btn-sm">{confirmLabel}</SubmitButton>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
    </div>
  ) : (
    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
      {label.replace(' this invite?', '').replace(' access?', '')}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Invite form                                                                */
/* -------------------------------------------------------------------------- */

function InviteForm({ properties }: { properties: PropertyOption[] }) {
  const [state, formAction, isPending] = useActionState<MemberActionState, FormData>(inviteMemberAction, EMPTY_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<InvitableRole>('co_host');
  const [capabilities, setCapabilities] = useState<CapabilitySet>(() => ({
    ...DEFAULT_CAPABILITIES_FOR_ROLE.co_host,
  }));
  const [allProperties, setAllProperties] = useState(true);

  const chooseRole = useCallback((nextRole: InvitableRole) => {
    setRole(nextRole);
    setCapabilities({ ...DEFAULT_CAPABILITIES_FOR_ROLE[nextRole] });
  }, []);

  // Reset the form after a successful invite so stale state can't be resent.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setRole('co_host');
      setCapabilities({ ...DEFAULT_CAPABILITIES_FOR_ROLE.co_host });
      setAllProperties(true);
    }
  }, [state.success]);

  // Capabilities are controlled state, so serialize them explicitly — without
  // this hidden input the server action receives no capability flags at all.
  const serializedCapabilities = useMemo(() => JSON.stringify(capabilities), [capabilities]);

  return (
    <section className="um-invite card" aria-labelledby="invite-heading">
      <div className="um-section-heading">
        <div>
          <p className="um-eyebrow">New teammate</p>
          <h2 id="invite-heading">Invite someone</h2>
          <p>Choose their role, exact actions, and the properties they can help with.</p>
        </div>
      </div>
      <form action={formAction} ref={formRef}>
        <FormMessage error={state.error} success={state.success} />
        <input type="hidden" name="capabilities" value={serializedCapabilities} />
        <div className="field">
          <label className="label" htmlFor="memberInviteEmail">
            Email address
          </label>
          <input
            className="input"
            id="memberInviteEmail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
            disabled={isPending}
          />
        </div>

        <fieldset className="um-role-fieldset">
          <legend>Role</legend>
          <input type="hidden" name="role" value={role} />
          <div className="um-role-grid" role="radiogroup" aria-label="Role">
            {MEMBER_ROLES.map((candidate) => {
              const selected = candidate.id === role;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`um-role-card${selected ? ' is-selected' : ''}`}
                  onClick={() => chooseRole(candidate.id)}
                >
                  <strong>{candidate.label}</strong>
                  <span>{candidate.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <CapabilityControls capabilities={capabilities} onChange={setCapabilities} />

        <fieldset className="um-property-fieldset">
          <legend>Property access</legend>
          <label className="um-master-toggle">
            <input
              type="checkbox"
              checked={allProperties}
              onChange={(event) => setAllProperties(event.target.checked)}
              aria-label="All properties"
            />
            <span>
              <strong>All properties</strong>
              <small>Default access for every current property on this account.</small>
            </span>
          </label>
          {!allProperties && (
            <div className="um-property-options">
              {properties.length > 0 ? (
                properties.map((property) => (
                  <label key={property.id} className="um-toggle">
                    <input type="checkbox" name="propertyIds" value={property.id} />
                    <span>{property.name}</span>
                  </label>
                ))
              ) : (
                <p className="faint" style={{ margin: 0, fontSize: '.82rem' }}>
                  Add a property before scoping access.
                </p>
              )}
            </div>
          )}
        </fieldset>
        <SubmitButton className="btn btn-primary um-submit">Send invitation</SubmitButton>
      </form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pending invites                                                            */
/* -------------------------------------------------------------------------- */

function PendingInviteItem({ invite }: { invite: PendingInvite }) {
  const [resendState, resendAction, resending] = useActionState<MemberActionState, FormData>(resendInviteAction, EMPTY_STATE);
  const [revokeState, revokeAction, revoking] = useActionState<MemberActionState, FormData>(revokeInviteAction, EMPTY_STATE);

  return (
    <li className="um-row">
      <div className="um-row-main">
        <div className="um-row-title">
          <strong>{invite.email}</strong>
          <span className="badge">{labelForRole(invite.role)}</span>
        </div>
        <p className="um-row-meta">
          Sent {formatDate(invite.createdAt)} · expires {formatDate(invite.expiresAt)}
        </p>
        <CapabilityChips capabilities={invite.capabilities} />
      </div>
      <div className="um-row-actions">
        <form action={resendAction}>
          <input type="hidden" name="inviteId" value={invite.id} />
          <SubmitButton className="btn btn-ghost btn-sm">Resend</SubmitButton>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="inviteId" value={invite.id} />
          <ConfirmButton
            label="Revoke this invite?"
            confirmLabel="Confirm revoke"
            ariaLabel={`Confirm revocation for ${invite.email}`}
            pending={revoking}
          />
        </form>
        <FormMessage
          error={resendState.error ?? revokeState.error}
          success={resendState.success ?? revokeState.success}
        />
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Members                                                                    */
/* -------------------------------------------------------------------------- */

function MemberItem({ member }: { member: ManagedMember }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role as InvitableRole);
  const [capabilities, setCapabilities] = useState<CapabilitySet>(() => ({ ...member.capabilities }));
  const [updateState, updateAction] = useActionState<MemberActionState, FormData>(updateMemberCapabilitiesAction, EMPTY_STATE);
  const [removeState, removeAction, removing] = useActionState<MemberActionState, FormData>(removeMemberAction, EMPTY_STATE);

  // Collapse the editor once the save succeeds.
  useEffect(() => {
    if (updateState.success) setEditing(false);
  }, [updateState.success]);

  const handleRoleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as InvitableRole;
    setRole(next);
    setCapabilities({ ...DEFAULT_CAPABILITIES_FOR_ROLE[next] });
  }, []);

  const editorId = `member-editor-${member.profileId}`;
  const serializedCapabilities = useMemo(() => JSON.stringify(capabilities), [capabilities]);
  const propertySummary = useMemo(
    () =>
      member.properties.length > 0
        ? member.properties.map((property) => property.name).join(' · ')
        : 'No active property assignments',
    [member.properties],
  );

  return (
    <li className="um-row">
      <div className="um-row-main">
        <div className="um-row-title">
          <strong>{member.name || member.email}</strong>
          <span className="badge">{labelForRole(member.role)}</span>
        </div>
        {member.name && <p className="um-row-meta">{member.email}</p>}
        <CapabilityChips capabilities={member.capabilities} />
        <p className="um-row-meta">{propertySummary}</p>
      </div>
      <div className="um-row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={editing}
          aria-controls={editorId}
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? 'Close editor' : 'Edit access'}
        </button>
        <form action={removeAction}>
          <input type="hidden" name="profileId" value={member.profileId} />
          <ConfirmButton
            label="Remove access?"
            confirmLabel="Confirm remove"
            ariaLabel={`Confirm removal for ${member.email}`}
            pending={removing}
          />
        </form>
        <FormMessage error={removeState.error} success={removeState.success} />
      </div>

      {editing && (
        <form className="um-editor" id={editorId} action={updateAction}>
          <input type="hidden" name="profileId" value={member.profileId} />
          <input type="hidden" name="capabilities" value={serializedCapabilities} />
          <div className="field">
            <label className="label" htmlFor={`member-role-${member.profileId}`}>
              Role
            </label>
            <select
              className="select"
              id={`member-role-${member.profileId}`}
              name="role"
              value={role}
              onChange={handleRoleChange}
            >
              {MEMBER_ROLES.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </div>
          <CapabilityControls capabilities={capabilities} onChange={setCapabilities} />
          <FormMessage error={updateState.error} success={updateState.success} />
          <SubmitButton className="btn btn-primary">Save access</SubmitButton>
        </form>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function UserManagementClient({
  accountName,
  properties,
  members,
  invites,
}: {
  accountName: string;
  properties: PropertyOption[];
  members: ManagedMember[];
  invites: PendingInvite[];
}) {
  return (
    <section className="um-shell">
      <header className="um-header">
        <p className="um-eyebrow">Account access</p>
        <h1>User management</h1>
        <p>
          Invite trusted people to <strong>{accountName}</strong>, then decide exactly how they can help.
        </p>
        <div className="um-summary" aria-label="Access summary">
          <span>
            <strong>{members.length}</strong> people with access
          </span>
          <span>
            <strong>{invites.length}</strong> pending invitation{invites.length === 1 ? '' : 's'}
          </span>
          <span>
            <strong>{properties.length}</strong> active propert{properties.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </header>

      <div className="um-layout">
        <div className="um-roster">
          <section className="um-panel card" aria-labelledby="members-heading">
            <div className="um-section-heading">
              <div>
                <p className="um-eyebrow">Live access</p>
                <h2 id="members-heading">People with access</h2>
                <p>Review the actions and properties each person can use.</p>
              </div>
              <span className="badge badge-teal">{members.length}</span>
            </div>
            {members.length > 0 ? (
              <ul className="um-list">
                {members.map((member) => (
                  <MemberItem key={member.profileId} member={member} />
                ))}
              </ul>
            ) : (
              <div className="um-empty">
                <strong>No one else has access yet.</strong>
                <p>Send your first invitation when you are ready to delegate.</p>
              </div>
            )}
          </section>

          <section className="um-panel card" aria-labelledby="invites-heading">
            <div className="um-section-heading">
              <div>
                <p className="um-eyebrow">Awaiting response</p>
                <h2 id="invites-heading">Pending invitations</h2>
                <p>Resend a fresh link or revoke access before it is accepted.</p>
              </div>
              <span className="badge">{invites.length}</span>
            </div>
            {invites.length > 0 ? (
              <ul className="um-list">
                {invites.map((invite) => (
                  <PendingInviteItem key={invite.id} invite={invite} />
                ))}
              </ul>
            ) : (
              <div className="um-empty">
                <strong>No invitations pending.</strong>
                <p>Invites are valid for 7 days and appear here until accepted or revoked.</p>
              </div>
            )}
          </section>
        </div>
        <InviteForm properties={properties} />
      </div>

      {/*
        NOTE: <style jsx> requires styled-jsx (built into Next.js Pages Router,
        opt-in for App Router). If these styles aren't applying in your App
        Router setup, move this block to a CSS Module or global stylesheet.
      */}
      <style jsx>{`
        .um-shell { max-width: 1160px; }
        .um-header { margin-bottom: 1.5rem; max-width: 760px; }
        .um-header h1, .um-section-heading h2 { margin: 0; }
        .um-header h1 { font-size: clamp(1.55rem, 3vw, 2.15rem); }
        .um-header > p:not(.um-eyebrow) { color: var(--text-muted); margin: .5rem 0 0; line-height: 1.55; }
        .um-eyebrow { color: var(--teal); font-size: .72rem; font-weight: 700; letter-spacing: .08em; margin: 0 0 .35rem; text-transform: uppercase; }
        .um-summary { display: flex; flex-wrap: wrap; gap: .55rem .9rem; margin-top: 1rem; }
        .um-summary span { background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; color: var(--text-muted); font-size: .8rem; padding: .35rem .65rem; }
        .um-summary strong { color: var(--text); }
        .um-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .85fr); gap: var(--gap-section); align-items: start; }
        .um-roster { display: grid; gap: var(--gap-section); min-width: 0; }
        .um-panel, .um-invite { padding: var(--pad-card); min-width: 0; }
        .um-section-heading { align-items: flex-start; display: flex; gap: 1rem; justify-content: space-between; margin-bottom: 1rem; }
        .um-section-heading h2 { font-size: 1.1rem; }
        .um-section-heading p:not(.um-eyebrow) { color: var(--text-muted); font-size: .84rem; line-height: 1.45; margin: .35rem 0 0; }
        .um-list { display: grid; gap: .75rem; list-style: none; margin: 0; padding: 0; }
        .um-row { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); display: grid; gap: .8rem; padding: .9rem; }
        .um-row-main { min-width: 0; }
        .um-row-title { align-items: center; display: flex; flex-wrap: wrap; gap: .45rem; min-width: 0; }
        .um-row-title strong { overflow-wrap: anywhere; }
        .um-row-meta { color: var(--text-faint); font-size: .78rem; line-height: 1.4; margin: .3rem 0 0; overflow-wrap: anywhere; }
        .um-capability-chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
        .um-capability-chips :global(.badge) { font-size: .67rem; }
        .um-row-actions { align-items: flex-start; display: flex; flex-wrap: wrap; gap: .45rem; }
        .um-row-actions form { margin: 0; }
        .um-row-actions :global(.alert) { flex-basis: 100%; font-size: .78rem; margin: .2rem 0 0; }
        .um-inline-confirm { align-items: center; background: color-mix(in srgb, var(--coral) 8%, var(--surface)); border: 1px solid var(--coral); border-radius: var(--radius-md); display: flex; flex-wrap: wrap; gap: .45rem; padding: .5rem; }
        .um-inline-confirm span { color: var(--text); font-size: .78rem; font-weight: 600; }
        .um-editor { border-top: 1px solid var(--border); display: grid; gap: .9rem; margin-top: .15rem; padding-top: 1rem; }
        .um-editor :global(.field) { margin-bottom: 0; }
        .um-empty { border: 1px dashed var(--border-strong); border-radius: var(--radius-md); color: var(--text); padding: 1.25rem; text-align: center; }
        .um-empty p { color: var(--text-muted); font-size: .83rem; line-height: 1.45; margin: .35rem 0 0; }
        .um-role-fieldset, .um-capability-fieldset, .um-property-fieldset { border: 0; margin: 0 0 1.15rem; min-width: 0; padding: 0; }
        .um-role-fieldset legend, .um-capability-fieldset legend, .um-property-fieldset legend { color: var(--text); font-size: .88rem; font-weight: 700; margin-bottom: .6rem; padding: 0; }
        .um-role-grid { display: grid; gap: .55rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .um-role-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text); cursor: pointer; display: grid; gap: .25rem; min-height: 88px; padding: .8rem; text-align: left; transition: border-color var(--tr), box-shadow var(--tr), transform var(--tr); }
        .um-role-card:hover, .um-role-card:focus-visible { border-color: var(--teal); }
        .um-role-card:hover { transform: translateY(-1px); }
        .um-role-card.is-selected { background: color-mix(in srgb, var(--teal) 11%, var(--surface-2)); border-color: var(--teal); box-shadow: 0 0 0 1px var(--teal); }
        .um-role-card strong { font-size: .86rem; }
        .um-role-card span { color: var(--text-muted); font-size: .75rem; line-height: 1.35; }
        .um-master-toggle, .um-toggle { align-items: center; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; display: flex; gap: .65rem; min-height: 44px; padding: .6rem .7rem; }
        .um-master-toggle { margin-bottom: .55rem; }
        .um-master-toggle input, .um-toggle input { accent-color: var(--teal); flex: 0 0 auto; height: 18px; width: 18px; }
        .um-master-toggle span { display: grid; gap: .1rem; }
        .um-master-toggle strong { font-size: .84rem; }
        .um-master-toggle small { color: var(--text-faint); font-size: .72rem; line-height: 1.3; }
        .um-toggle-grid, .um-property-options { display: grid; gap: .45rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .um-toggle { color: var(--text); font-size: .8rem; line-height: 1.25; min-width: 0; }
        .um-toggle span { overflow-wrap: anywhere; }
        .um-submit { margin-top: .2rem; width: 100%; }
        @media (max-width: 920px) { .um-layout { grid-template-columns: 1fr; } .um-invite { order: -1; } }
        @media (max-width: 560px) { .um-role-grid, .um-toggle-grid, .um-property-options { grid-template-columns: 1fr; } .um-row-actions { width: 100%; } .um-row-actions > form { min-width: 0; } .um-row-actions :global(.btn) { min-height: 44px; } }
      `}</style>
    </section>
  );
}
