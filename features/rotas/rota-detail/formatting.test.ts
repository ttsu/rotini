import { describe, expect, it } from 'vitest';

import { formatCountdown, formatDuration } from './formatting';

describe('formatDuration', () => {
  it('handles back-to-back', () => {
    expect(formatDuration(60, true)).toBe('Back to back');
  });

  it('formats minutes under an hour', () => {
    expect(formatDuration(45, false)).toBe('45 min');
  });

  it('formats one hour', () => {
    expect(formatDuration(60, false)).toBe('1 hour');
  });

  it('formats day and week presets', () => {
    expect(formatDuration(1440, false)).toBe('1 day');
    expect(formatDuration(10080, false)).toBe('1 week');
  });
});

describe('formatCountdown', () => {
  it('returns soon when target is past', () => {
    expect(formatCountdown(new Date(Date.now() - 60000).toISOString())).toBe('soon');
  });

  it('shows minutes when under an hour', () => {
    const t = new Date(Date.now() + 45 * 60000).toISOString();
    const out = formatCountdown(t);
    expect(out).toMatch(/^\d+m$/);
  });
});
