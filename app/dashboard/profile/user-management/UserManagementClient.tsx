'use client';

import { memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
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
  updateMemberAccessAction,
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
  inviterName: string;
  propertyNames: string[];
  coversAllProperties: boolean;
  capabilities: CapabilitySet;
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

function daysUntil(date: string): number {
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
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

function initialsFor(name: string | null, email: string): string {
  const source = (name ?? '').trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/* -------------------------------------------------------------------------- */
/*  Shared controls                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Role + access state for both the invite dialog and the member editor.
 * Switching roles re-seats the switches on that role's defaults and surfaces a
 * notice, so the reset is never silent; touching any switch dismisses it.
 */
function useRoleAccess(initialRole: InvitableRole, initialCapabilities?: CapabilitySet) {
  const [role, setRole] = useState<InvitableRole>(initialRole);
  const [capabilities, setCapabilities] = useState<CapabilitySet>(() => ({
    ...(initialCapabilities ?? DEFAULT_CAPABILITIES_FOR_ROLE[initialRole]),
  }));
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  function selectRole(nextRole: InvitableRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    setCapabilities({ ...DEFAULT_CAPABILITIES_FOR_ROLE[nextRole] });
    setResetNotice(
      `Access switches were reset to the ${labelForRole(nextRole)} defaults. Adjust anything before saving.`,
    );
  }

  function changeCapabilities(next: CapabilitySet) {
    setCapabilities(next);
    setResetNotice(null);
  }

  // Hard re-seat without the notice. Stable identity so effects can depend on
  // it: used after a successful send and to re-sync the member editor when
  // revalidation delivers fresh server state.
  const apply = useCallback((nextRole: InvitableRole, nextCapabilities: CapabilitySet) => {
    setRole(nextRole);
    setCapabilities({ ...nextCapabilities });
    setResetNotice(null);
  }, []);

  return { role, capabilities, resetNotice, selectRole, changeCapabilities, apply };
}

function RoleCards({
  value,
  onSelect,
}: {
  value: InvitableRole;
  onSelect: (role: InvitableRole) => void;
}) {
  return (
    <div className="um-role-grid" role="radiogroup" aria-label="Role">
      {MEMBER_ROLES.map((candidate) => {
        const selected = candidate.id === value;
        return (
          <button
            key={candidate.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`um-role-card${selected ? ' is-selected' : ''}`}
            onClick={() => onSelect(candidate.id)}
          >
            <strong>{candidate.label}</strong>
            <span>{candidate.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`um-switch-row${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="um-switch-text">
        <span className="um-switch-label">{label}</span>
      </span>
      <span className="um-switch" data-on={checked} aria-hidden>
        <span className="um-switch-thumb" />
      </span>
    </button>
  );
}

function AccessSwitches({
  capabilities,
  onChange,
}: {
  capabilities: CapabilitySet;
  onChange: (next: CapabilitySet) => void;
}) {
  const enabled = CAPABILITIES.reduce((count, c) => count + (capabilities[c.key] ? 1 : 0), 0);
  const allOn = enabled === CAPABILITIES.length;
  return (
    <div className="um-switch-list">
      <div className="um-switch-head">
        <span>
          <strong>{enabled} of {CAPABILITIES.length}</strong> actions on
        </span>
        <button type="button" className="um-link-button" onClick={() => onChange(buildCapabilitySet(!allOn))}>
          {allOn ? 'Turn all off' : 'Turn all on'}
        </button>
      </div>
      {CAPABILITIES.map((capability) => (
        <Switch
          key={capability.key}
          checked={capabilities[capability.key]}
          onChange={(next) => onChange({ ...capabilities, [capability.key]: next })}
          label={capability.label}
        />
      ))}
    </div>
  );
}

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

/** Copyable invite link shown once after a send/resend — the owner's fallback
 *  delivery path when the email lands in spam or Resend fails. The read-only
 *  input is the manual fallback when the clipboard API is blocked. */
function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, non-secure context) — the input stays
      // selectable, so nothing is actually lost.
    }
  }

  return (
    <div className="um-copy-link">
      <input
        className="input"
        readOnly
        value={link}
        onFocus={(event) => event.target.select()}
        aria-label="Invitation link"
      />
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

/** Two-step destructive action. Labels are explicit props — the old string
 *  munging (label.replace(' this invite?', '')) produced different button text
 *  than the prompt it stood for. */
function ConfirmButton({
  idleLabel,
  prompt,
  confirmLabel,
  ariaLabel,
}: {
  idleLabel: string;
  prompt: string;
  confirmLabel: string;
  ariaLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
        {idleLabel}
      </button>
    );
  }
  return (
    <div className="um-confirm" role="group" aria-label={ariaLabel}>
      <span>{prompt}</span>
      <SubmitButton className="btn btn-danger btn-sm">{confirmLabel}</SubmitButton>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Invite dialog                                                              */
/* -------------------------------------------------------------------------- */

function InviteDialog({
  accountName,
  properties,
  onClose,
}: {
  accountName: string;
  properties: PropertyOption[];
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState<MemberActionState, FormData>(inviteMemberAction, EMPTY_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [allProperties, setAllProperties] = useState(true);
  const { role, capabilities, resetNotice, selectRole, changeCapabilities, apply } = useRoleAccess('co_host');
  const [sentSummary, setSentSummary] = useState<{ email: string; roleLabel: string } | null>(null);
  // Action results arrive as fresh state objects; handling each object once
  // lets the owner send a second invite without the confirmation re-appearing.
  const handledStateRef = useRef<MemberActionState | null>(null);

  // Focus the first field on open and lock the page behind the dialog.
  useEffect(() => {
    emailRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPending, onClose]);

  useEffect(() => {
    if (!state.success || handledStateRef.current === state) return;
    handledStateRef.current = state;
    setSentSummary({ email, roleLabel: labelForRole(role) });
    formRef.current?.reset();
    setEmail('');
    setAllProperties(true);
    apply('co_host', { ...DEFAULT_CAPABILITIES_FOR_ROLE.co_host });
  }, [state, email, role, apply]);

  return (
    <div
      className="um-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <div className="card um-dialog" role="dialog" aria-modal="true" aria-labelledby="um-invite-title">
        <div className="um-dialog-head">
          <div>
            <p className="um-eyebrow">New teammate</p>
            <h2 id="um-invite-title">Invite someone to {accountName}</h2>
            <p className="um-dialog-sub">
              Four quick choices. They get an email saying who invited them and what they
              can do — the link inside works for sign-in or a new account, and expires in 7 days.
            </p>
          </div>
          <button
            type="button"
            className="um-dialog-close"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close invite dialog"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {sentSummary && state.success ? (
          <div className="um-sent">
            <FormMessage success={state.success} />
            <div className="um-sent-body">
              <p>
                <strong>On its way to {sentSummary.email}.</strong> They’ll see your name, the{' '}
                {sentSummary.roleLabel} role, and the actions you enabled. If the email doesn’t
                arrive, share this link directly — it’s the same one from the email:
              </p>
              {state.inviteLink ? <CopyLink link={state.inviteLink} /> : null}
            </div>
            <div className="um-dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setSentSummary(null)}>
                Invite another
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form action={formAction} ref={formRef} className="um-invite-form">
            <FormMessage error={state.error} />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="capabilities" value={JSON.stringify(capabilities)} />

            <section className="um-step">
              <div className="um-step-head">
                <span className="um-step-num" aria-hidden>1</span>
                <h3>Their email</h3>
              </div>
              <input
                className="input"
                ref={emailRef}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                disabled={isPending}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </section>

            <section className="um-step">
              <div className="um-step-head">
                <span className="um-step-num" aria-hidden>2</span>
                <h3>Their role</h3>
              </div>
              <RoleCards value={role} onSelect={selectRole} />
              {resetNotice ? <p className="um-note" role="status">{resetNotice}</p> : null}
            </section>

            <section className="um-step">
              <div className="um-step-head">
                <span className="um-step-num" aria-hidden>3</span>
                <h3>What they can do</h3>
              </div>
              <AccessSwitches capabilities={capabilities} onChange={changeCapabilities} />
            </section>

            <section className="um-step">
              <div className="um-step-head">
                <span className="um-step-num" aria-hidden>4</span>
                <h3>Where they can do it</h3>
              </div>
              <label className="um-master-toggle">
                <input
                  type="checkbox"
                  checked={allProperties}
                  onChange={(event) => setAllProperties(event.target.checked)}
                  aria-label="All properties"
                />
                <span>
                  <strong>All properties</strong>
                  <small>Every current property on this account.</small>
                </span>
              </label>
              {!allProperties && (
                properties.length > 0 ? (
                  <div className="um-property-options">
                    {properties.map((property) => (
                      <label key={property.id} className="um-check">
                        <input type="checkbox" name="propertyIds" value={property.id} />
                        <span>{property.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="um-note">
                    Add a property before scoping access — this invite will cover everything for now.
                  </p>
                )
              )}
            </section>

            <div className="um-dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </button>
              <SubmitButton className="btn btn-primary">Send invitation</SubmitButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pending invites                                                            */
/* -------------------------------------------------------------------------- */

function PendingInviteItem({ invite }: { invite: PendingInvite }) {
  const [resendState, resendAction] = useActionState<MemberActionState, FormData>(resendInviteAction, EMPTY_STATE);
  const [revokeState, revokeAction] = useActionState<MemberActionState, FormData>(revokeInviteAction, EMPTY_STATE);
  const daysLeft = daysUntil(invite.expiresAt);

  return (
    <li className="um-row">
      <div className="um-row-top">
        <span className="um-avatar um-avatar-pending" aria-hidden>
          {initialsFor(null, invite.email)}
        </span>
        <div className="um-row-main">
          <div className="um-row-title">
            <strong>{invite.email}</strong>
            <span className="badge">{labelForRole(invite.role)}</span>
            <span className="badge badge-coral">
              {daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </span>
          </div>
          <p className="um-row-meta">
            Sent {formatDate(invite.createdAt)} by {invite.inviterName} ·{' '}
            {invite.coversAllProperties ? 'All properties' : invite.propertyNames.join(' · ')}
          </p>
          <CapabilityChips capabilities={invite.capabilities} />
          {resendState.inviteLink ? (
            <div className="um-fresh-link">
              <p className="um-note">Fresh link created — it’s also in the re-sent email.</p>
              <CopyLink link={resendState.inviteLink} />
            </div>
          ) : null}
        </div>
        <div className="um-row-actions">
          <form action={resendAction}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <SubmitButton className="btn btn-ghost btn-sm">Resend</SubmitButton>
          </form>
          <form action={revokeAction}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <ConfirmButton
              idleLabel="Revoke"
              prompt={`Revoke the invitation for ${invite.email}?`}
              confirmLabel="Yes, revoke"
              ariaLabel={`Confirm revocation for ${invite.email}`}
            />
          </form>
          <FormMessage error={resendState.error ?? revokeState.error} success={revokeState.success} />
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Members                                                                    */
/* -------------------------------------------------------------------------- */

function MemberItem({
  member,
  allProperties,
}: {
  member: ManagedMember;
  allProperties: PropertyOption[];
}) {
  const [editing, setEditing] = useState(false);
  const memberRole = member.role as InvitableRole;
  const { role, capabilities, resetNotice, selectRole, changeCapabilities, apply } = useRoleAccess(
    memberRole,
    member.capabilities,
  );
  const [updateState, updateAction] = useActionState<MemberActionState, FormData>(updateMemberAccessAction, EMPTY_STATE);
  const [removeState, removeAction] = useActionState<MemberActionState, FormData>(removeMemberAction, EMPTY_STATE);

  // Re-sync the editor when revalidation delivers fresh server state (after a
  // save, or after another row's action re-fetches the page).
  useEffect(() => {
    apply(memberRole, member.capabilities);
  }, [memberRole, member.capabilities, apply]);

  // Collapse the editor once a save succeeds — action results are fresh state
  // objects, so depending on the object (not the message string) catches every
  // save, including two identical saves in a row.
  useEffect(() => {
    if (updateState.success) setEditing(false);
  }, [updateState]);

  const editorId = `member-editor-${member.profileId}`;
  const memberPropertyIds = new Set(member.properties.map((property) => property.id));

  return (
    <li className="um-row">
      <div className="um-row-top">
        <span className="um-avatar" aria-hidden>
          {initialsFor(member.name, member.email)}
        </span>
        <div className="um-row-main">
          <div className="um-row-title">
            <strong>{member.name || member.email}</strong>
            <span className="badge">{labelForRole(member.role)}</span>
          </div>
          {member.name ? <p className="um-row-meta">{member.email}</p> : null}
          <CapabilityChips capabilities={member.capabilities} />
          <p className="um-row-meta">
            {member.properties.length} of {allProperties.length}{' '}
            {allProperties.length === 1 ? 'property' : 'properties'}
          </p>
        </div>
        <div className="um-row-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={editing}
            aria-controls={editorId}
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? 'Close' : 'Edit access'}
          </button>
          <form action={removeAction}>
            <input type="hidden" name="profileId" value={member.profileId} />
            <ConfirmButton
              idleLabel="Remove"
              prompt={`Remove ${member.name || member.email} from every property?`}
              confirmLabel="Yes, remove"
              ariaLabel={`Confirm removal for ${member.email}`}
            />
            <FormMessage error={removeState.error} success={removeState.success} />
          </form>
        </div>
      </div>

      {editing && (
        <form className="um-editor" id={editorId} action={updateAction}>
          <input type="hidden" name="profileId" value={member.profileId} />
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="capabilities" value={JSON.stringify(capabilities)} />

          <section className="um-step">
            <div className="um-step-head">
              <h3>Role</h3>
            </div>
            <RoleCards value={role} onSelect={selectRole} />
            {resetNotice ? <p className="um-note" role="status">{resetNotice}</p> : null}
          </section>

          <section className="um-step">
            <div className="um-step-head">
              <h3>What they can do</h3>
            </div>
            <AccessSwitches capabilities={capabilities} onChange={changeCapabilities} />
          </section>

          <section className="um-step">
            <div className="um-step-head">
              <h3>Properties they can reach</h3>
            </div>
            <div className="um-property-options">
              {allProperties.map((property) => (
                <label key={property.id} className="um-check">
                  <input
                    type="checkbox"
                    name="propertyIds"
                    value={property.id}
                    defaultChecked={memberPropertyIds.has(property.id)}
                  />
                  <span>{property.name}</span>
                </label>
              ))}
            </div>
            <p className="um-note">
              Saving applies the role and actions to every selected property. To remove this
              person from all of them, use Remove instead.
            </p>
          </section>

          <FormMessage error={updateState.error} success={updateState.success} />
          <div className="um-editor-actions">
            <SubmitButton className="btn btn-primary btn-sm">Save access</SubmitButton>
          </div>
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      `${member.name ?? ''} ${member.email}`.toLowerCase().includes(needle),
    );
  }, [members, query]);

  return (
    <section className="um-shell">
      <header className="um-header">
        <p className="um-eyebrow">Account access</p>
        <h1>User management</h1>
        <p>
          Invite trusted people to <strong>{accountName}</strong>, choose their role, and set
          exactly what they can do.
        </p>
        <div className="um-summary" aria-label="Access summary">
          <span>
            <strong>{members.length}</strong> {members.length === 1 ? 'person' : 'people'} with access
          </span>
          <span>
            <strong>{invites.length}</strong> pending invitation{invites.length === 1 ? '' : 's'}
          </span>
          <span>
            <strong>{properties.length}</strong> active propert{properties.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </header>

      <div className="um-toolbar">
        <input
          className="input um-search"
          type="search"
          placeholder="Filter by name or email…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter members by name or email"
        />
        <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} aria-hidden /> Invite someone
        </button>
      </div>

      <section className="um-panel card" aria-labelledby="members-heading">
        <div className="um-section-heading">
          <div>
            <p className="um-eyebrow">Live access</p>
            <h2 id="members-heading">People with access</h2>
            <p>Edit a role, the actions, or the properties — one save applies it all.</p>
          </div>
          <span className="badge badge-teal">{members.length}</span>
        </div>
        {members.length > 0 ? (
          filteredMembers.length > 0 ? (
            <ul className="um-list">
              {filteredMembers.map((member) => (
                <MemberItem key={member.profileId} member={member} allProperties={properties} />
              ))}
            </ul>
          ) : (
            <div className="um-empty">
              <strong>No one matches “{query.trim()}”.</strong>
              <p>Try a different name or email.</p>
            </div>
          )
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
            <p>Resend a fresh link, copy it for another channel, or revoke before it’s accepted.</p>
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

      {inviteOpen ? (
        <InviteDialog
          accountName={accountName}
          properties={properties}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </section>
  );
}
