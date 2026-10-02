// #195 launch: can this host be texted when a guest needs them? Pure, no I/O.
// Mirrors the SMS gates in lib/notify.ts (phone + verified + explicit opt-in).
// STOP suppression is not checked here: a host who replied STOP has sms_opt_in
// cleared by the Twilio webhook, so they show as not_opted_in.

export type TextAlertGap = 'no_phone' | 'unverified' | 'not_opted_in';

export function textAlertGap(profile: {
  phone?: string | null;
  phone_verified_at?: string | null;
  sms_opt_in?: boolean | null;
}): TextAlertGap | null {
  if (!profile.phone) return 'no_phone';
  if (!profile.phone_verified_at) return 'unverified';
  if (!profile.sms_opt_in) return 'not_opted_in';
  return null;
}
