import { redactCredentials } from '@/lib/brain/redact';
import { WIFI_CONTEXT } from '@/lib/guest/wifi-instructions';

export interface GuestHistoryRow {
  id?: string;
  role: string;
  content: string;
  created_at: string;
  model: string | null;
  guest_replay_safe?: boolean;
}

export const LEGACY_WIFI_NOTICE = 'This earlier Wi-Fi answer is unavailable. Ask the host for the current password location and connection instructions.';

export function serializeGuestHistory(rows: GuestHistoryRow[], priorWifiContext = false) {
  let legacyWifiContext = priorWifiContext;
  return rows.filter((row) => ['guest', 'assistant', 'host'].includes(row.role)).map((row) => {
    legacyWifiContext ||= WIFI_CONTEXT.test(row.content);
    const legacyWifi = row.role === 'assistant' && row.guest_replay_safe !== true && legacyWifiContext;
    const content = legacyWifi ? LEGACY_WIFI_NOTICE
      : row.role === 'assistant' ? redactCredentials(row.content).text : row.content;
    return { ...(row.id ? { id: row.id } : {}), role: row.role, content, created_at: row.created_at };
  });
}
