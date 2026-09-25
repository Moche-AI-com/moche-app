import { redactCredentials } from '@/lib/brain/redact';
import { WIFI_CONTEXT } from '@/lib/guest/wifi-instructions';

export interface GuestHistoryRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
  model: string | null;
  intent: string | null;
  guest_replay_safe: boolean;
}

export const LEGACY_WIFI_NOTICE = 'This earlier Wi-Fi answer is unavailable. Ask the host for the current password location and connection instructions.';

export function serializeGuestHistory(rows: GuestHistoryRow[], priorGuestContent = '') {
  let awaitingWifiReply = WIFI_CONTEXT.test(priorGuestContent);
  return rows.filter((row) => ['guest', 'assistant', 'host'].includes(row.role)).map((row) => {
    if (row.role === 'guest') awaitingWifiReply = WIFI_CONTEXT.test(row.content);
    const legacyWifi = row.role === 'assistant' && !row.guest_replay_safe
      && (awaitingWifiReply || WIFI_CONTEXT.test(row.content));
    const content = legacyWifi ? LEGACY_WIFI_NOTICE
      : row.role === 'assistant' ? redactCredentials(row.content).text : row.content;
    if (row.role !== 'guest') awaitingWifiReply = false;
    return { id: row.id, role: row.role, content, created_at: row.created_at, intent: row.intent };
  });
}
