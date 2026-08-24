import { describe, expect, it } from 'vitest';
import {
  assessFetchedPage,
  buildListingDraft,
  detectListingProvider,
  parseExtractionResponse,
} from './extract';

const PAGE = {
  title: 'Cedar Cottage',
  sourceUrl: 'https://www.vrbo.com/123',
  text: 'Cedar Cottage is a 3 bedroom, 2 bathroom house that sleeps six guests. Amenities include wifi, a pool, a full kitchen, a washer and dryer, and free parking. House rules: no smoking, no parties, pets considered. Check-in starts at 4pm with a smart lock and check-out is at 11am. The welcome book answers frequently asked questions about the oven and thermostat. '.repeat(6),
};

const VALID_JSON = JSON.stringify({
  groups: [
    { key: 'property_details', text: '3 bedroom, 2 bathroom house sleeping six guests.', status: 'stated', confidence: 0.95, evidence: '3 bedroom, 2 bathroom house that sleeps six guests' },
    { key: 'amenities', text: 'Wifi, pool, full kitchen, washer and dryer, free parking.', status: 'stated', confidence: 0.9, evidence: 'wifi, a pool, a full kitchen' },
    { key: 'rules', text: 'No smoking and no parties. Pets considered.', status: 'stated', confidence: 0.88, evidence: 'no smoking, no parties' },
    { key: 'arrival_access', text: 'Check-in from 4pm, check-out by 11am.', status: 'stated', confidence: 0.8, evidence: 'Check-in starts at 4pm' },
    { key: 'appliances_faqs', text: '', status: 'missing', confidence: null, evidence: null },
  ],
});

describe('detectListingProvider', () => {
  it('detects known listing providers from the URL hostname', () => {
    expect(detectListingProvider('https://www.airbnb.com/rooms/12')).toBe('airbnb');
    expect(detectListingProvider('https://example.test/listing')).toBe('example.test');
  });
});

describe('assessFetchedPage', () => {
  it('accepts a substantive listing page', () => {
    expect(assessFetchedPage(PAGE)).toEqual({ usable: true });
  });
  it('rejects bot-wall and challenge pages', () => {
    const text = `Verify you are human to continue. ${PAGE.text}`;
    expect(assessFetchedPage({ ...PAGE, text })).toEqual({ usable: false, reason: 'blocked' });
  });
  it('rejects pages with too little readable text', () => {
    expect(assessFetchedPage({ ...PAGE, text: 'Nice house.' })).toEqual({ usable: false, reason: 'too_thin' });
  });
  it('rejects long pages with no listing signals', () => {
    const text = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. '.repeat(20);
    expect(assessFetchedPage({ ...PAGE, text })).toEqual({ usable: false, reason: 'not_a_listing' });
  });
});

describe('parseExtractionResponse', () => {
  it('parses valid JSON and ignores unknown group keys', () => {
    const withExtra = JSON.stringify({
      groups: [...(JSON.parse(VALID_JSON) as { groups: unknown[] }).groups, { key: 'secret_stuff', text: 'ignore me' }],
    });
    const parsed = parseExtractionResponse(withExtra);
    expect(parsed?.size).toBe(5);
    expect(parsed?.has('secret_stuff' as never)).toBe(false);
  });
  it('returns null for non-JSON output', () => {
    expect(parseExtractionResponse('Sorry, I cannot help with that.')).toBeNull();
  });
  it('tolerates markdown code fences', () => {
    expect(parseExtractionResponse(`\`\`\`json\n${VALID_JSON}\n\`\`\``)?.size).toBe(5);
  });
});

describe('buildListingDraft', () => {
  it('creates the five review groups from model output, marking missing groups undetected', async () => {
    const draft = await buildListingDraft(PAGE, 'https://www.vrbo.com/123', async () => VALID_JSON);
    expect(draft.provider).toBe('vrbo');
    expect(draft.reviewGroups.map((group) => group.key)).toEqual([
      'property_details',
      'amenities',
      'rules',
      'arrival_access',
      'appliances_faqs',
    ]);
    const rules = draft.reviewGroups.find((group) => group.key === 'rules');
    expect(rules?.detected).toBe(true);
    expect(rules?.text).toContain('No smoking');
    expect(rules?.confidence).toBe(0.88);
    const faqs = draft.reviewGroups.find((group) => group.key === 'appliances_faqs');
    expect(faqs?.detected).toBe(false);
    expect(faqs?.status).toBe('missing');
  });
  it('throws when the model returns unusable output', async () => {
    await expect(buildListingDraft(PAGE, PAGE.sourceUrl, async () => 'not json')).rejects.toThrow('unusable output');
  });
  it('throws when every group is missing', async () => {
    const empty = JSON.stringify({ groups: [{ key: 'rules', text: '', status: 'missing', confidence: null, evidence: null }] });
    await expect(buildListingDraft(PAGE, PAGE.sourceUrl, async () => empty)).rejects.toThrow('unusable output');
  });
  it('strips credential-shaped sentences from model output', async () => {
    const withSecret = JSON.stringify({
      groups: [
        { key: 'arrival_access', text: 'Check-in is at 4pm. The door code is 4321. Park in the driveway.', status: 'stated', confidence: 0.9, evidence: null },
      ],
    });
    const draft = await buildListingDraft(PAGE, PAGE.sourceUrl, async () => withSecret);
    const arrival = draft.reviewGroups.find((group) => group.key === 'arrival_access');
    expect(arrival?.text).not.toContain('4321');
    expect(arrival?.text).toContain('Check-in is at 4pm');
  });
});
