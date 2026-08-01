import { describe, expect, it } from 'vitest';

import type { AwayWindow } from './conflicts';
import { handleDayPress, mergedResult, windowsMergedBy } from './range-selection';

function win(over: Partial<AwayWindow> = {}): AwayWindow {
  return {
    id: 'w1',
    start_date: '2026-08-10',
    end_date: '2026-08-12',
    tz: 'Europe/London',
    reason: null,
    ...over,
  };
}

describe('handleDayPress', () => {
  it('anchors a single-day draft on the first tap', () => {
    const r = handleDayPress({ date: '2026-08-03', draft: null, windows: [] });
    expect(r).toEqual({
      kind: 'draft',
      draft: { anchor: '2026-08-03', start: '2026-08-03', end: '2026-08-03' },
    });
  });

  it('completes the range forwards on the second tap', () => {
    const first = handleDayPress({ date: '2026-08-03', draft: null, windows: [] });
    const second = handleDayPress({
      date: '2026-08-06',
      draft: first.kind === 'draft' ? first.draft : null,
      windows: [],
    });
    expect(second).toMatchObject({ draft: { start: '2026-08-03', end: '2026-08-06' } });
  });

  it('normalises a backwards drag', () => {
    const second = handleDayPress({
      date: '2026-08-01',
      draft: { anchor: '2026-08-06', start: '2026-08-06', end: '2026-08-06' },
      windows: [],
    });
    expect(second).toMatchObject({ draft: { start: '2026-08-01', end: '2026-08-06' } });
  });

  it('keeps the anchor so the range can be redrawn from the same pivot', () => {
    const r = handleDayPress({
      date: '2026-08-01',
      draft: { anchor: '2026-08-06', start: '2026-08-06', end: '2026-08-06' },
      windows: [],
    });
    expect(r.kind === 'draft' && r.draft.anchor).toBe('2026-08-06');
  });

  it('opens a saved window for editing when nothing is being drawn', () => {
    const r = handleDayPress({ date: '2026-08-11', draft: null, windows: [win()] });
    expect(r).toEqual({ kind: 'edit', window: win() });
  });

  it('extends the draft across a saved window once a drag is underway', () => {
    // Deliberately NOT an edit — the user is mid-drag, and the server will
    // merge the overlap on save.
    const r = handleDayPress({
      date: '2026-08-11',
      draft: { anchor: '2026-08-08', start: '2026-08-08', end: '2026-08-08' },
      windows: [win()],
    });
    expect(r).toMatchObject({ kind: 'draft', draft: { start: '2026-08-08', end: '2026-08-11' } });
  });
});

describe('windowsMergedBy', () => {
  it('finds an overlapping window', () => {
    expect(windowsMergedBy([win()], { start: '2026-08-11', end: '2026-08-14' })).toHaveLength(1);
  });

  it('finds a window that merely abuts, matching the server ±1 rule', () => {
    expect(windowsMergedBy([win()], { start: '2026-08-13', end: '2026-08-14' })).toHaveLength(1);
    expect(windowsMergedBy([win()], { start: '2026-08-07', end: '2026-08-09' })).toHaveLength(1);
  });

  it('ignores a window with a clear gap', () => {
    expect(windowsMergedBy([win()], { start: '2026-08-14', end: '2026-08-15' })).toHaveLength(0);
  });

  it('excludes the window being edited', () => {
    expect(
      windowsMergedBy([win()], { start: '2026-08-10', end: '2026-08-12' }, 'w1'),
    ).toHaveLength(0);
  });
});

describe('mergedResult', () => {
  it('returns the union of the draft and everything it touches', () => {
    expect(mergedResult([win()], { start: '2026-08-11', end: '2026-08-20' })).toEqual({
      start: '2026-08-10',
      end: '2026-08-20',
    });
  });

  it('spans several absorbed windows', () => {
    const a = win({ id: 'a', start_date: '2026-08-01', end_date: '2026-08-03' });
    const b = win({ id: 'b', start_date: '2026-08-10', end_date: '2026-08-12' });
    expect(mergedResult([a, b], { start: '2026-08-04', end: '2026-08-09' })).toEqual({
      start: '2026-08-01',
      end: '2026-08-12',
    });
  });

  it('leaves an untouched range alone', () => {
    expect(mergedResult([win()], { start: '2026-09-01', end: '2026-09-02' })).toEqual({
      start: '2026-09-01',
      end: '2026-09-02',
    });
  });
});
