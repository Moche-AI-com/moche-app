// Host-facing explanation for a text that could not be sent. Pure (no server
// imports) so it is unit-testable and shared by every host-initiated SMS send.
export type SmsFailureReason = 'invalid_phone' | 'sms_disabled' | 'opted_out' | 'provider_failed';

export function smsFailureMessage(reason: SmsFailureReason): { error: string; status: number } {
  switch (reason) {
    case 'invalid_phone':
      return {
        status: 400,
        error: "That phone number doesn't look right. Enter a US number like 781-555-0123, or use + and the country code for other countries.",
      };
    case 'sms_disabled':
      return { status: 503, error: 'Text messaging is temporarily unavailable. Try email instead.' };
    case 'opted_out':
      return { status: 409, error: 'This number has opted out of texts from Moche-AI (replied STOP). Try email instead.' };
    default:
      return {
        status: 502,
        error: "The text couldn't be sent or confirmed. Check the number before resending, or try email.",
      };
  }
}
