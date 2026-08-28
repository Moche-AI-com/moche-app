import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Constants } from '../lib/database.types';
import {
  CATEGORY_FOR_KIND,
  NOTIFICATION_CATEGORIES,
  hiddenKindsForPrefs,
} from '../lib/notifications/categories';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase', 'migrations', '20260828120000_notification_preferences.sql'),
  'utf8',
);
const bellSource = readFileSync(resolve(process.cwd(), 'components', 'dashboard', 'NotificationBell.tsx'), 'utf8');
const historySource = readFileSync(resolve(process.cwd(), 'app', 'dashboard', 'notifications', 'page.tsx'), 'utf8');
const prefActionsSource = readFileSync(
  resolve(process.cwd(), 'app', 'dashboard', 'profile', 'notifications', 'actions.ts'),
  'utf8',
);
const notifySource = readFileSync(resolve(process.cwd(), 'lib', 'notify.ts'), 'utf8');

describe('notification category registry', () => {
  it('maps every notification_kind enum value to exactly one category', () => {
    const dbKinds = Constants.public.Enums.notification_kind as readonly string[];
    for (const kind of dbKinds) {
      expect(
        (CATEGORY_FOR_KIND as Record<string, string>)[kind],
        `no category mapped for kind "${kind}"`,
      ).toBeDefined();
    }
    expect(Object.keys(CATEGORY_FOR_KIND).sort()).toEqual([...dbKinds].sort());
  });

  it('keeps host messages, billing, and system always on', () => {
    const alwaysOn = NOTIFICATION_CATEGORIES.filter((c) => c.alwaysOn).map((c) => c.key);
    expect(alwaysOn).toEqual(expect.arrayContaining(['host_messages', 'billing', 'system']));
  });

  it('hides exactly the kinds behind an unsubscribed category', () => {
    const hidden = hiddenKindsForPrefs([{ category: 'extras', enabled: false }]);
    expect(hidden.has('extras')).toBe(true);
    expect(hidden.size).toBe(1);
  });

  it('never hides always-on kinds, even if a stored row says disabled', () => {
    const hidden = hiddenKindsForPrefs([
      { category: 'host_messages', enabled: false },
      { category: 'billing', enabled: false },
      { category: 'system', enabled: false },
    ]);
    expect(hidden.size).toBe(0);
  });

  it('fails open when preferences cannot be read', () => {
    expect(hiddenKindsForPrefs(null).size).toBe(0);
  });
});

describe('notification preferences migration access boundaries', () => {
  it('enables RLS and pins every policy to the owning member', () => {
    expect(migration).toContain('alter table public.notification_preferences enable row level security');
    expect(migration).toContain('create policy notif_prefs_select');
    expect(migration).toContain('create policy notif_prefs_insert');
    expect(migration).toContain('create policy notif_prefs_update');
    expect(migration).toContain('profile_id = auth.uid()');
    expect(migration).toContain('public.is_account_member(host_account_id)');
  });

  it('offers no anonymous, cross-account, or delete path', () => {
    expect(migration).not.toContain('using (true)');
    expect(migration).not.toMatch(/notification_preferences[\s\S]{0,700}to anon/i);
    expect(migration).not.toMatch(/create policy notif_prefs_[\s\S]{0,160}for delete/i);
  });

  it('adds the host_message kind so guest messages stop overloading system', () => {
    expect(migration).toContain("add value if not exists 'host_message'");
  });
});

describe('notification UX surfaces', () => {
  it('gives every linked bell item an explicit View notification anchor', () => {
    expect(bellSource).toContain('View notification');
    expect(bellSource).toContain('href={item.link}');
    expect(bellSource).toContain('notification-view-');
  });

  it('gives history rows the same visible affordance and human kind labels', () => {
    expect(historySource).toContain('View notification');
    expect(historySource).toContain('labelForKind');
  });

  it('rejects disabling always-on categories server-side, not just in the UI', () => {
    expect(prefActionsSource).toContain('alwaysOn');
    expect(prefActionsSource).toContain('cannot be turned off');
  });

  it('gates notify() fan-out on stored preferences and fails open', () => {
    expect(notifySource).toContain('notify_fanout_muted');
    expect(notifySource).toContain('notify_pref_read_failed');
  });
});
