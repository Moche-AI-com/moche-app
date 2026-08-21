'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

type Member = {
  id: string;
  role: string;
  name: string;
  email: string | null;
  canReplyGuests: boolean;
  canReceiveEscalations: boolean;
  canSendAnnouncements: boolean;
  canPublishGuestAnswers: boolean;
};

export function ChatPermissionsPanel({ propertyId }: { propertyId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/host/properties/${propertyId}/guest-chats/permissions`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load_failed'))))
      .then((json) => setMembers(Array.isArray(json.members) ? json.members : []))
      .catch(() => setError('Could not load chat permissions.'))
      .finally(() => setLoading(false));
  }, [propertyId]);

  async function update(member: Member, next: Pick<Member, 'canSendAnnouncements' | 'canPublishGuestAnswers'>) {
    setSavingId(member.id);
    setError(null);
    const optimistic = { ...member, ...next };
    setMembers((current) => current.map((item) => (item.id === member.id ? optimistic : item)));
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/guest-chats/permissions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, ...next }),
      });
      if (!res.ok) throw new Error('save_failed');
    } catch {
      setMembers((current) => current.map((item) => (item.id === member.id ? member : item)));
      setError('Could not update chat permissions.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <details style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '.9rem', background: 'rgba(255,255,255,.035)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        <ShieldCheck size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />
        Team chat permissions
      </summary>

      <div style={{ marginTop: '.9rem', display: 'grid', gap: '.65rem' }}>
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading team…</p>
        ) : members.length === 0 ? (
          <p className="muted">No assigned team members are available for this property.</p>
        ) : (
          members.map((member) => (
            <div key={member.id} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '.7rem', display: 'grid', gap: '.45rem' }}>
              <div>
                <strong>{member.name}</strong>
                <span className="muted" style={{ marginLeft: '.45rem', fontSize: '.78rem' }}>{member.role}</span>
              </div>
              <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem' }}>
                <input
                  type="checkbox"
                  checked={member.canSendAnnouncements}
                  disabled={savingId === member.id}
                  onChange={(event) => void update(member, { canSendAnnouncements: event.target.checked, canPublishGuestAnswers: member.canPublishGuestAnswers })}
                />
                Can send announcements
              </label>
              <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem' }}>
                <input
                  type="checkbox"
                  checked={member.canPublishGuestAnswers}
                  disabled={savingId === member.id}
                  onChange={(event) => void update(member, { canSendAnnouncements: member.canSendAnnouncements, canPublishGuestAnswers: event.target.checked })}
                />
                Can publish guest answers directly to the AI Brain
              </label>
            </div>
          ))
        )}
        {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}
      </div>
    </details>
  );
}
