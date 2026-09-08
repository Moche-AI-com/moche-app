// In-memory PostgREST boundary. Synthetic records only; no network client.
export function messagingDb(seed: Record<string, Record<string, any>[]> = {}, failures: Record<string, string> = {}) {
  const rows = structuredClone(seed);
  const writes: { table: string; op: string; values: any }[] = [];
  const reads: string[] = [];
  let serial = 0;
  const from = (table: string) => {
    reads.push(table);
    let op = 'select';
    let values: any;
    let singular = false;
    let limit = Infinity;
    let ascending = true;
    let orderKey = '';
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select: () => q,
      insert: (v: any) => { op = 'insert'; values = v; return q; },
      update: (v: any) => { op = 'update'; values = v; return q; },
      upsert: (v: any) => { op = 'upsert'; values = v; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: any) => { filters.push((r) => r[k] !== v); return q; },
      is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      not: (k: string, _o: string, v: any) => { filters.push((r) => (r[k] ?? null) !== v); return q; },
      in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return q; },
      gt: (k: string, v: any) => { filters.push((r) => r[k] > v); return q; },
      gte: (k: string, v: any) => { filters.push((r) => r[k] >= v); return q; },
      order: (k: string, options: any) => { orderKey = k; ascending = options?.ascending !== false; return q; },
      limit: (v: number) => { limit = v; return q; },
      or: (expr: string) => {
        const parts = expr.split(',').map((s) => s.split('.'));
        filters.push((r) => parts.some(([k, operator, ...v]) => operator === 'eq' && String(r[k]) === v.join('.')));
        return q;
      },
      single: () => { singular = true; return q; },
      maybeSingle: () => { singular = true; return q; },
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        if (failures[`${table}:${op}`] || failures[table]) return { data: null, error: { message: failures[`${table}:${op}`] || failures[table] } };
        let matches = (rows[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op !== 'select') {
          writes.push({ table, op, values });
          if (op === 'insert' || op === 'upsert') {
            matches = (Array.isArray(values) ? values : [values]).map((v) => ({
              id: `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
              created_at: new Date().toISOString(), ...v,
            }));
            rows[table] = [...(rows[table] ?? []), ...matches];
          } else if (op === 'update') matches.forEach((r) => Object.assign(r, values));
        }
        if (orderKey) matches.sort((a, b) => String(a[orderKey]).localeCompare(String(b[orderKey])) * (ascending ? 1 : -1));
        matches = matches.slice(0, limit);
        return { data: singular ? matches[0] ?? null : matches, error: null, count: matches.length };
      }).then(resolve, reject),
      catch: (reject: any) => q.then((x: any) => x, reject),
    };
    return q;
  };
  return { from, rows, writes, reads };
}

export const ids = {
  property: '10000000-0000-4000-8000-000000000001',
  stay: '20000000-0000-4000-8000-000000000001',
  session: '30000000-0000-4000-8000-000000000001',
  conversation: '40000000-0000-4000-8000-000000000001',
  escalation: '50000000-0000-4000-8000-000000000001',
  account: '60000000-0000-4000-8000-000000000001',
  owner: '70000000-0000-4000-8000-000000000001',
  message: '80000000-0000-4000-8000-000000000001',
};

export function readyGuestRow(overrides: Record<string, any> = {}) {
  return {
    id: ids.session, property_id: ids.property, stay_id: ids.stay, status: 'verified',
    revoked_at: null, expires_at: '2099-01-01T00:00:00Z', registered_at: '2026-09-01T00:00:00Z',
    terms_accepted_at: '2026-09-01T00:00:00Z', guest_identity_id: 'identity-synthetic',
    guest_contact: '+15005550006', guest_contact_type: 'phone',
    notification_consent: true, notification_consent_at: '2026-09-01T00:00:00Z',
    phone_verified_at: '2026-09-01T00:00:00Z', sms_opted_out_at: null, ...overrides,
  };
}

export function messagingSeed() {
  return {
    properties: [{ id: ids.property, slug: 'synthetic-villa', display_name: 'Synthetic villa', host_account_id: ids.account }],
    stays: [{ id: ids.stay, property_id: ids.property, status: 'active', deleted_at: null, check_out: '2099-01-01T00:00:00Z' }],
    guest_access_sessions: [readyGuestRow()],
    conversations: [{
      id: ids.conversation, property_id: ids.property, stay_id: ids.stay, channel: 'host_chat',
      guest_session_id: ids.session, guest_identity_id: 'identity-synthetic',
    }],
    host_accounts: [{ id: ids.account, owner_id: ids.owner }],
    profiles: [{ id: ids.owner, phone: '+15005550006', phone_verified_at: '2026-09-01T00:00:00Z', sms_opt_in: true, email: null }],
    organization_members: [],
    property_members: [],
    notification_preferences: [],
    sms_suppressions: [],
  };
}
