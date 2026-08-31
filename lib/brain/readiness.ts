// Property readiness has one canonical calculation. Consumers must render both
// the percentage and their checklist from this result so they cannot drift.
export type RequirementStatus = 'missing' | 'partial' | 'satisfied' | 'not_applicable';

export interface KnowledgeRequirement {
key: string;
category: string;
label: string;
why: string;
fieldPaths: string[];
}

export const READINESS_CATEGORIES = [
{ key: 'arrival_access_departure', label: 'Arrival, access, and departure', weight: 0.25 },
{ key: 'safety_contacts', label: 'Safety and contacts', weight: 0.20 },
{ key: 'rules', label: 'Rules', weight: 0.15 },
{ key: 'essential_amenities', label: 'Essential amenities', weight: 0.15 },
{ key: 'basics', label: 'Basics', weight: 0.10 },
{ key: 'appliance_guidance', label: 'Appliance guidance', weight: 0.05 },
{ key: 'local_recommendations', label: 'Local recommendations', weight: 0.05 },
{ key: 'faqs', label: 'FAQs', weight: 0.05 },
] as const;

export const KNOWLEDGE_REQUIREMENTS: readonly KnowledgeRequirement[] = [
{ key: 'arrival_instructions', category: 'arrival_access_departure', label: 'Arrival instructions', why: 'Guests need to know how to arrive and get in.', fieldPaths: ['brain.arrival_instructions'] },
{ key: 'departure_instructions', category: 'arrival_access_departure', label: 'Departure instructions', why: 'Guests need clear check-out steps.', fieldPaths: ['brain.departure_instructions'] },
{ key: 'emergency_contact', category: 'safety_contacts', label: 'Emergency contact', why: 'Guests need a reliable contact for urgent issues.', fieldPaths: ['brain.emergency_contact'] },
{ key: 'safety_information', category: 'safety_contacts', label: 'Safety information', why: 'Guests need to find essential safety information quickly.', fieldPaths: ['brain.safety_information'] },
{ key: 'house_rules', category: 'rules', label: 'House rules', why: 'Clear rules prevent avoidable guest issues.', fieldPaths: ['brain.house_rules'] },
{ key: 'essential_amenities', category: 'essential_amenities', label: 'Essential amenities', why: 'Guests need to know what essential amenities are available.', fieldPaths: ['brain.essential_amenities'] },
{ key: 'property_basics', category: 'basics', label: 'Property basics', why: 'Guests need the key facts about the property.', fieldPaths: ['brain.property_basics'] },
{ key: 'appliance_guidance', category: 'appliance_guidance', label: 'Appliance guidance', why: 'Guests need safe instructions for major appliances.', fieldPaths: ['property_appliances'] },
{ key: 'local_recommendations', category: 'local_recommendations', label: 'Local recommendations', why: 'Guests benefit from a few host-approved nearby recommendations.', fieldPaths: ['recommendations'] },
{ key: 'frequently_asked_questions', category: 'faqs', label: 'Frequently asked questions', why: 'Answers to common questions reduce avoidable messages.', fieldPaths: ['brain.faqs'] },
] as const;

export interface ReadinessMissing {
/** Legacy aliases retained while existing cards migrate to the canonical key. */
key: string;
required: boolean;
requirementKey: string;
label: string;
why: string;
}

export interface ReadinessCategory {
key: string;
label: string;
weight: number;
/** Weighted percentage points earned by this category, between 0 and weight * 100. */
earned: number;
missing: ReadinessMissing[];
}

export interface Readiness {
score: number;
categories: ReadinessCategory[];
missing: ReadinessMissing[];
/** Retained for existing UI callers; pending proposals are not scored as requirements. */
pendingReviews: number;
ready: boolean;
label: 'Needs work' | 'Almost there' | 'Ready to share';
}

export interface ReadinessStatusInput {
requirementKey: string;
status: RequirementStatus;
}

export interface ReadinessInput {
statuses?: readonly ReadinessStatusInput[];
pendingReviews?: number;
}

// Amendment 001-A.3 parity: `not_applicable` is absent by design here too. An
// N/A requirement leaves the denominator entirely rather than being credited as
// satisfied, so readiness cannot drift above completeness by inflating N/A fields.
const CREDIT: Record<Exclude<RequirementStatus, 'not_applicable'>, number> = {
missing: 0,
partial: 0.5,
satisfied: 1,
};

/**
 * Computes every readiness output from the same requirement statuses. Do not
 * calculate a percentage in a component: this is the only readiness engine.
 */
export function computeReadiness(input: ReadinessInput = {}): Readiness {
const statuses = new Map(input.statuses?.map(({ requirementKey, status }) => [requirementKey, status]) ?? []);
const categories = READINESS_CATEGORIES.map((category) => {
const requirements = KNOWLEDGE_REQUIREMENTS.filter((requirement) => requirement.category === category.key);
const missing = requirements
.filter((requirement) => (statuses.get(requirement.key) ?? 'missing') !== 'satisfied' && (statuses.get(requirement.key) ?? 'missing') !== 'not_applicable')
.map(({ key, label, why }) => ({ key, required: true, requirementKey: key, label, why }));
const scored = requirements.filter((requirement) => (statuses.get(requirement.key) ?? 'missing') !== 'not_applicable');
const credit = scored.length === 0
? 1
: scored.reduce((sum, requirement) => sum + CREDIT[(statuses.get(requirement.key) ?? 'missing') as Exclude<RequirementStatus, 'not_applicable'>], 0) / scored.length;
return {
key: category.key,
label: category.label,
weight: category.weight,
earned: Number((category.weight * credit * 100).toFixed(2)),
missing,
};
});
const score = Number(categories.reduce((sum, category) => sum + category.earned, 0).toFixed(2));
const missing = categories.flatMap((category) => category.missing);
const ready = missing.length === 0;
const label: Readiness['label'] = ready ? 'Ready to share' : score >= 70 ? 'Almost there' : 'Needs work';
return {
score,
categories,
missing,
pendingReviews: input.pendingReviews ?? 0,
ready,
label,
};
}
