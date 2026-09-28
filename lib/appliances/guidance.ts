import { z } from 'zod';
import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';

const suggestionSchema = z.object({
  guestGuidance: z.string().trim().max(4000),
  answers: z.array(z.object({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(4000),
    sourceIndex: z.number().int().nonnegative(),
  })).max(5),
});

export type ApplianceDraft = z.infer<typeof suggestionSchema>;

function unsafeGuestText(text: string): boolean {
  return redactCredentials(text).redactions.length > 0 || requiresLicensedTechnician(text);
}

/** AI output is an editable candidate only; it never creates approved knowledge. */
export function parseApplianceDraft(raw: string, sourceCount: number): ApplianceDraft | null {
  if (!Number.isInteger(sourceCount) || sourceCount < 1 || raw.length > 30000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { return null; }
  const result = suggestionSchema.safeParse(parsed);
  if (!result.success) return null;
  const draft = result.data;
  if (unsafeGuestText(draft.guestGuidance) || draft.answers.some((item) =>
    item.sourceIndex >= sourceCount || unsafeGuestText(`${item.question}\n${item.answer}`))) return null;
  return draft;
}

export type GuestAppliance = { id: string; propertyId: string; modelNumber: string | null; guestVisible: boolean };
export type StoredApplianceAnswer = {
  id: string; propertyId: string; applianceId: string; question: string; answer: string;
  status: string; approvedAt: string | null; modelNumberSnapshot: string | null;
};

/** Defense in depth after a property-and-appliance-scoped database read. */
export function approvedApplianceAnswers(
  appliance: GuestAppliance, rows: readonly StoredApplianceAnswer[],
): StoredApplianceAnswer[] {
  if (!appliance.guestVisible) return [];
  return rows.filter((row) => row.propertyId === appliance.propertyId
    && row.applianceId === appliance.id && row.status === 'approved' && !!row.approvedAt
    && (row.modelNumberSnapshot === null || row.modelNumberSnapshot === appliance.modelNumber)
    && !unsafeGuestText(`${row.question}\n${row.answer}`));
}
