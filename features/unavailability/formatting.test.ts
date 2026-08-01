import { describe, expect, it } from 'vitest';

import { countDays, formatDateRange, formatDayCount } from './formatting';

describe('formatDateRange', () => {
  it('renders a single day once', () => {
    expect(formatDateRange('2026-08-01', '2026-08-01')).toBe('1 Aug 2026');
  });

  it('renders a range within one year with the year only at the end', () => {
    expect(formatDateRange('2026-06-14', '2026-06-20')).toBe('14 Jun – 20 Jun 2026');
  });

  it('renders both years when the range crosses new year', () => {
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('falls back to the raw dates when input is unparseable', () => {
    expect(formatDateRange('nope', 'also-nope')).toBe('nope – also-nope');
  });

  // The midday anchor exists so the label does not slip a day for devices
  // behind UTC, where `new Date('2026-08-01')` would be 31 July locally.
  it('keeps the intended day regardless of the device offset', () => {
    expect(formatDateRange('2026-01-01', '2026-01-01')).toBe('1 Jan 2026');
    expect(formatDateRange('2026-12-31', '2026-12-31')).toBe('31 Dec 2026');
  });
});

describe('countDays', () => {
  it('counts a single day as one', () => {
    expect(countDays('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('is inclusive of both endpoints', () => {
    expect(countDays('2026-08-01', '2026-08-04')).toBe(4);
  });

  it('counts across a DST change without drift', () => {
    // Europe/London springs forward on 2026-03-29.
    expect(countDays('2026-03-28', '2026-03-30')).toBe(3);
  });

  it('returns 0 when the range is inverted', () => {
    expect(countDays('2026-08-04', '2026-08-01')).toBe(0);
  });
});

describe('formatDayCount', () => {
  it('singularises one day', () => {
    expect(formatDayCount('2026-08-01', '2026-08-01')).toBe('1 day');
  });

  it('pluralises several days', () => {
    expect(formatDayCount('2026-08-01', '2026-08-04')).toBe('4 days');
  });
});
