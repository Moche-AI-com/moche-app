import { describe, expect, it } from 'vitest';
import {
  buildServiceReportSms,
  buildServiceReportSubject,
  buildServiceReportText,
  contactLine,
  shareContactReady,
  type ShareReportInput,
} from './share-report';

const base: ShareReportInput = {
  propertyName: 'Cabin 12',
  serviceType: 'maintenance',
  urgency: 'high',
  summary: 'Kitchen sink leaking',
  details: 'Water pooling under the kitchen sink; worse after running the dishwasher.',
  reportedAt: '2026-08-24T15:00:00.000Z',
  reference: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  contact: { name: 'Alex', label: 'Manager', phone: '+15551234567', email: 'host@example.com' },
};

describe('shareContactReady', () => {
  it('requires at least one reachable channel', () => {
    expect(shareContactReady(null)).toBe(false);
    expect(shareContactReady(undefined)).toBe(false);
    expect(shareContactReady({ name: 'A', phone: null, email: null })).toBe(false);
    expect(shareContactReady({ name: 'A', phone: '  ', email: null })).toBe(false);
    expect(shareContactReady({ name: 'A', phone: '+1555', email: null })).toBe(true);
    expect(shareContactReady({ name: 'A', phone: null, email: 'a@b.co' })).toBe(true);
  });
});

describe('contactLine', () => {
  it('fills both blanks when the contact has email and phone', () => {
    expect(contactLine(base.contact)).toBe(
      'Message the property hosts at host@example.com or text +15551234567 for more information.',
    );
  });

  it('degrades to whichever channel exists', () => {
    expect(contactLine({ ...base.contact, phone: null })).toBe(
      'Message the property hosts at host@example.com for more information.',
    );
    expect(contactLine({ ...base.contact, email: null })).toBe(
      'Message the property hosts by text at +15551234567 for more information.',
    );
  });
});

describe('buildServiceReportText', () => {
  it('renders the allowlisted intake plus the contact line', () => {
    const text = buildServiceReportText(base);
    expect(text).toContain('Service report — Cabin 12');
    expect(text).toContain('Reference: 3fa85f64');
    expect(text).toContain('Type: maintenance · Urgency: high');
    expect(text).toContain('Kitchen sink leaking');
    expect(text).toContain('Water pooling under the kitchen sink');
    expect(text).toContain(
      'Message the property hosts at host@example.com or text +15551234567 for more information.',
    );
    expect(text).toContain('Sent via Moche-AI on behalf of Cabin 12.');
  });

  it('falls back to a generic headline when summary is empty', () => {
    const text = buildServiceReportText({ ...base, summary: null, details: null });
    expect(text).toContain('Service request');
  });

  it('cannot carry fields outside the allowlist', () => {
    // The builder's input type has no transcript/media/location/timeline slots;
    // this guards against a future refactor smuggling them through via any.
    const poisoned = {
      ...base,
      interview_transcript: 'GUEST SECRET TRANSCRIPT',
      location_note: 'Unit 4B lockbox 1234',
      access_instructions: 'Gate code 9876',
      media_urls: ['https://example.com/guest-photo.jpg'],
    } as unknown as ShareReportInput;
    const text = buildServiceReportText(poisoned);
    expect(text).not.toContain('GUEST SECRET TRANSCRIPT');
    expect(text).not.toContain('lockbox');
    expect(text).not.toContain('Gate code');
    expect(text).not.toContain('guest-photo');
  });
});

describe('buildServiceReportSms', () => {
  it('stays compact and keeps the contact line and STOP notice', () => {
    const sms = buildServiceReportSms(base);
    expect(sms).toContain('Cabin 12');
    expect(sms).toContain('Kitchen sink leaking');
    expect(sms).toContain('ref 3fa85f64');
    expect(sms).toContain('Message the property hosts at host@example.com or text +15551234567');
    expect(sms).toContain('Reply STOP to opt out.');
    expect(sms.length).toBeLessThan(900);
  });

  it('clips very long details', () => {
    const sms = buildServiceReportSms({ ...base, details: 'x'.repeat(2000) });
    expect(sms.length).toBeLessThan(900);
    expect(sms).toContain('…');
  });
});

describe('buildServiceReportSubject', () => {
  it('names the property and request type', () => {
    expect(buildServiceReportSubject(base)).toBe('Service report — maintenance at Cabin 12');
  });
});
