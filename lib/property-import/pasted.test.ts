import { describe, expect, it } from 'vitest';
import { assessFetchedPage } from './extract';
import { buildPastedPage, derivePastedTitle, PASTED_SOURCE_URL } from './pasted';

const LISTING_TEXT = `Lakeside Cabin Retreat — 3 bedrooms, 2 bathrooms, sleeps 8 guests

Welcome to our cozy house on the lake. The home has a full kitchen, washer and dryer, wifi, air conditioning, and private parking for two cars. The pool is open May through September.

House rules: no smoking, no parties, quiet hours after 10pm. Pets allowed with prior approval. A damage deposit is required.

Check-in is at 4pm and check-out at 11am. Arrival is self-serve with a keypad at the front door — access details arrive on arrival day. Parking is in the driveway.

Appliances and FAQs: the oven is gas and the thermostat is in the hallway. Frequently asked question: where is the trash? Bins are beside the garage.`;

describe('buildPastedPage', () => {
  it('synthesizes a FetchedPage the shared pipeline accepts', () => {
    const page = buildPastedPage(LISTING_TEXT);
    expect(page.sourceUrl).toBe(PASTED_SOURCE_URL);
    expect(assessFetchedPage(page)).toEqual({ usable: true });
  });

  it('derives a title from the first meaningful line', () => {
    expect(derivePastedTitle('\n\nCozy 2BR cabin by the lake\nSleeps 6')).toBe('Cozy 2BR cabin by the lake');
    expect(derivePastedTitle('short')).toBe('Pasted listing details');
  });
});

describe('pasted content gate', () => {
  it('rejects thin pastes', () => {
    expect(assessFetchedPage(buildPastedPage('Just a few words.'))).toEqual({ usable: false, reason: 'too_thin' });
  });

  it('rejects pasted text that is not listing-shaped', () => {
    const nonsense = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(20);
    expect(assessFetchedPage(buildPastedPage(nonsense))).toEqual({ usable: false, reason: 'not_a_listing' });
  });
});
