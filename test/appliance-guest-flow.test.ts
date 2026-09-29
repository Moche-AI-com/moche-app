import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const picker = source('app/g/[slug]/AiChatWorkflow.tsx');
const inventory = source('app/api/guest/[slug]/appliances/route.ts');
const chat = source('app/api/guest/[slug]/chat/route.ts');

describe('appliance guest journey contract', () => {
  it('keeps the chosen device attached to approved prompts and free-form chat', () => {
    expect(picker).toContain('setSelectedAppliance(a)');
    expect(picker).toContain('applianceId: selectedForTurn?.id');
    expect(picker).toContain('onClick={() => askFromSheet(item.text)}');
    expect(picker).toContain('inputRef.current?.focus()');
    expect(picker).toContain("{t('askTitle')} · {activeAppliance.name}");
  });
  it('keeps the guest inventory bound to session, property, visibility and approved questions', () => {
    expect(inventory).toContain('getGuestSession()');
    expect(inventory).toContain('property.slug !== slug');
    expect(inventory).toContain(".eq('property_id', session.propertyId).eq('guest_visible', true)");
    expect(inventory).toContain(".eq('property_id', session.propertyId).eq('status', 'approved')");
    expect(inventory).toContain('approvedApplianceAnswers');
  });
  it('validates selected IDs again server-side before answering', () => {
    expect(chat).toContain('z.string().uuid().safeParse(rawApplianceId)');
    expect(chat).toContain(".eq('property_id', session.propertyId)");
    expect(chat).toContain(".eq('guest_visible', true)");
    expect(chat).toContain('answerSelectedAppliance');
  });
});
