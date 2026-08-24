import { describe, expect, it } from 'vitest';
import type { AIMessage } from '@/lib/ai/provider';
import {
  assessFetchedPage,
  buildListingDraft,
  detectListingProvider,
  extractListingImageUrls,
  parseExtractionResponse,
} from './extract';

const PAGE = {
  title: 'Cedar Cottage',
  sourceUrl: 'https://www.vrbo.com/123',
  text: 'Cedar Cottage is a 3 bedroom, 2 bathroom house that sleeps six guests. Amenities include wifi, a pool, a full kitchen, a washer and dryer, and free parking. House rules: no smoking, no parties, pets considered. Check-in starts at 4pm with a smart lock and check-out is at 11am. The welcome book answers frequently asked questions about the oven and thermostat. '.repeat(6),
};

const PAGE_WITH_PHOTO = {
  ...PAGE,
  text: `${PAGE.text} ![Pool and deck](https://cdn.example.com/pictures/pool.jpg)`,
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

describe('extractListingImageUrls', () => {
  it('extracts listing photos and skips icons and logos', () => {
    const md =
      '![Living room](https://a0.muscache.com/im/pictures/abc.jpg?aki=1) ![logo](https://cdn.example.com/logo.png) ![Pool](https://images.cdn.vrbo.io/odstrc/xyz.jpg)';
    const urls = extractListingImageUrls(md);
    expect(urls).toContain('https://a0.muscache.com/im/pictures/abc.jpg?aki=1');
    expect(urls).toHaveLength(2);
  });
  it('dedupes and caps the set', () => {
    const md = Array.from({ length: 9 }, (_, i) => `![p${i}](https://cdn.example.com/photo${i % 6}.jpg)`).join(' ');
    expect(extractListingImageUrls(md)).toHaveLength(5);
  });
  it('returns nothing when the page has no photo syntax', () => {
    expect(extractListingImageUrls(PAGE.text)).toEqual([]);
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

  it('attaches listing photos as multimodal content when present', async () => {
    const seen: AIMessage[][] = [];
    await buildListingDraft(PAGE_WITH_PHOTO, PAGE.sourceUrl, async (messages) => {
      seen.push(messages);
      return VALID_JSON;
    });
    const content = seen[0][0].content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content.some((part) => part.type === 'image_url')).toBe(true);
      expect(content.some((part) => part.type === 'text' && part.text.includes('PHOTOS:'))).toBe(true);
    }
  });
  it('sends a plain text message when the page has no photos', async () => {
    const seen: AIMessage[][] = [];
    await buildListingDraft(PAGE, PAGE.sourceUrl, async (messages) => {
      seen.push(messages);
      return VALID_JSON;
    });
    expect(typeof seen[0][0].content).toBe('string');
  });
  it('retries text-only when the multimodal call is rejected', async () => {
    let calls = 0;
    const draft = await buildListingDraft(PAGE_WITH_PHOTO, PAGE.sourceUrl, async () => {
      calls += 1;
      if (calls === 1) throw new Error('image_url content is not supported by this model');
      return VALID_JSON;
    });
    expect(calls).toBe(2);
    expect(draft.reviewGroups).toHaveLength(5);
  });
  it('never retries a model mismatch into a weaker path', async () => {
    let calls = 0;
    await expect(
      buildListingDraft(PAGE_WITH_PHOTO, PAGE.sourceUrl, async () => {
        calls += 1;
        throw new Error('extraction_model_mismatch');
      }),
    ).rejects.toThrow('extraction_model_mismatch');
    expect(calls).toBe(1);
  });
});
