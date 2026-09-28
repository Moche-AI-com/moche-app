import { describe, expect, it } from 'vitest';
import { approvedApplianceAnswers, parseApplianceDraft, type StoredApplianceAnswer } from './guidance';

const appliance = { id: 'appliance-a', propertyId: 'property-a', modelNumber: 'MODEL-1', guestVisible: true };
const approved: StoredApplianceAnswer = {
  id: 'answer-a', propertyId: 'property-a', applianceId: 'appliance-a',
  question: 'How do I start it?', answer: 'Press the Start button.',
  status: 'approved', approvedAt: '2026-09-28T14:00:00Z', modelNumberSnapshot: 'MODEL-1',
};

describe('appliance draft boundary', () => {
  it('only accepts bounded, sourced, safe model output', () => {
    const draft = parseApplianceDraft(JSON.stringify({
      guestGuidance: 'The washer is in the laundry room.',
      answers: [{ question: approved.question, answer: approved.answer, sourceIndex: 0 }],
    }), 1);
    expect(draft?.answers).toHaveLength(1);
    expect(parseApplianceDraft(JSON.stringify({ guestGuidance: '', answers: [{ ...draft!.answers[0], sourceIndex: 1 }] }), 1)).toBeNull();
  });

  it('rejects credentials, technician instructions and invalid JSON', () => {
    expect(parseApplianceDraft('not JSON', 1)).toBeNull();
    expect(parseApplianceDraft(JSON.stringify({ guestGuidance: 'Call a licensed electrician to repair the panel.', answers: [] }), 1)).toBeNull();
    expect(parseApplianceDraft(JSON.stringify({ guestGuidance: '', answers: [{ question: 'Wi-Fi password?', answer: 'Password: mySecret123', sourceIndex: 0 }] }), 1)).toBeNull();
  });
});

describe('appliance guest eligibility', () => {
  it('filters hidden, unapproved, cross-property and cross-appliance answers', () => {
    const rows = [approved, { ...approved, id: 'pending', status: 'draft' },
      { ...approved, id: 'other-property', propertyId: 'property-b' },
      { ...approved, id: 'other-appliance', applianceId: 'appliance-b' }];
    expect(approvedApplianceAnswers(appliance, rows).map((row) => row.id)).toEqual(['answer-a']);
    expect(approvedApplianceAnswers({ ...appliance, guestVisible: false }, rows)).toEqual([]);
  });

  it('does not serve a former model answer after the model changes', () => {
    expect(approvedApplianceAnswers({ ...appliance, modelNumber: 'MODEL-2' }, [approved])).toEqual([]);
  });
});
