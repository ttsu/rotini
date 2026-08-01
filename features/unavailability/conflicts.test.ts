import { describe, expect, it } from 'vitest';

import {
  deriveConflicts,
  eachDateInclusive,
  mergeRanges,
  rangesTouch,
  windowCovering,
  type AwayWindow,
  type ConflictOcc,
} from './conflicts';

function win(over: Partial<AwayWindow> = {}): AwayWindow {
  return {
    id: 'w1',
    start_date: '2026-08-01',
    end_date: '2026-08-07',
    tz: 'Europe/London',
    reason: null,
    ...over,
  };
}

function occ(over: Partial<ConflictOcc> = {}): ConflictOcc {
  return {
    id: 'o1',
    rota_id: 'r1',
    scheduled_at: '2026-08-03T09:00:00Z',
    ends_at: '2026-08-03T10:00:00Z',
    status: 'scheduled',
    rota: { name: 'Kitchen', tz: 'Europe/London' },
    ...over,
  };
}

const NO_IDS = new Set<string>();

function derive(args: {
  occurrences: ConflictOcc[];
  windows: AwayWindow[];
  mine?: Set<string>;
  others?: Set<string>;
  now?: Date;
}) {
  return deriveConflicts({
    occurrences: args.occurrences,
    windows: args.windows,
    myOpenCoverageOccurrenceIds: args.mine ?? NO_IDS,
    otherPendingOccurrenceIds: args.others ?? NO_IDS,
    now: args.now ?? new Date('2026-07-01T00:00:00Z'),
  });
}

describe('windowCovering', () => {
  it('matches an occurrence inside the window', () => {
    expect(windowCovering([win()], '2026-08-03T09:00:00Z')?.id).toBe('w1');
  });

  it('is inclusive of the first day', () => {
    expect(windowCovering([win()], '2026-08-01T09:00:00Z')).not.toBeNull();
  });

  it('is inclusive of the last day', () => {
    expect(windowCovering([win()], '2026-08-07T09:00:00Z')).not.toBeNull();
  });

  it('excludes the day before', () => {
    expect(windowCovering([win()], '2026-07-31T09:00:00Z')).toBeNull();
  });

  it('excludes the day after', () => {
    expect(windowCovering([win()], '2026-08-08T09:00:00Z')).toBeNull();
  });

  it('returns null when there are no windows', () => {
    expect(windowCovering([], '2026-08-03T09:00:00Z')).toBeNull();
  });

  // The rule evaluates the occurrence in the WINDOW's tz, not the rota's and
  // not UTC. Mirrors isUserAbsent() in the materializer.
  it('evaluates in the window tz, not the rota tz', () => {
    // 21:00Z on 7 Aug is 09:00 on 8 Aug in Auckland (+12) but 22:00 on 7 Aug
    // in London (+1). The member is in London and is away through the 7th, so
    // this is a conflict even though the rota's local date is the 8th.
    const w = win({ tz: 'Europe/London', start_date: '2026-08-01', end_date: '2026-08-07' });
    const o = '2026-08-07T21:00:00Z';
    expect(windowCovering([w], o)).not.toBeNull();
  });

  it('excludes an occurrence that crosses midnight out of the window in the window tz', () => {
    // 23:30Z on 7 Aug is 00:30 on 8 Aug in London — outside a window ending
    // on the 7th, even though the UTC date is still the 7th.
    const w = win({ tz: 'Europe/London', start_date: '2026-08-01', end_date: '2026-08-07' });
    expect(windowCovering([w], '2026-08-07T23:30:00Z')).toBeNull();
  });

  it('handles a DST transition in the window tz', () => {
    // US DST ends 2026-11-01. 04:00Z on 2 Nov is 23:00 on 1 Nov in New York
    // (EST, -5) — inside a one-day window on the 1st. Naive UTC-date logic
    // would read this as 2 Nov and miss it.
    const w = win({ tz: 'America/New_York', start_date: '2026-11-01', end_date: '2026-11-01' });
    expect(windowCovering([w], '2026-11-02T04:00:00Z')).not.toBeNull();
    // 05:30Z on 1 Nov is 01:30 EDT (-4), still the 1st.
    expect(windowCovering([w], '2026-11-01T05:30:00Z')).not.toBeNull();
    // 06:00Z on 2 Nov is 01:00 EST on the 2nd — outside.
    expect(windowCovering([w], '2026-11-02T06:00:00Z')).toBeNull();
  });

  it('returns the first matching window when several are supplied', () => {
    const a = win({ id: 'a', start_date: '2026-08-01', end_date: '2026-08-07' });
    const b = win({ id: 'b', start_date: '2026-09-01', end_date: '2026-09-07' });
    expect(windowCovering([a, b], '2026-09-03T09:00:00Z')?.id).toBe('b');
  });
});

describe('deriveConflicts', () => {
  it('returns nothing when no occurrence falls in a window', () => {
    const r = derive({ occurrences: [occ({ scheduled_at: '2026-09-03T09:00:00Z' })], windows: [win()] });
    expect(r.all).toHaveLength(0);
    expect(r.byOccurrenceId.size).toBe(0);
  });

  it('indexes conflicts by occurrence and by window', () => {
    const r = derive({ occurrences: [occ()], windows: [win()] });
    expect(r.all).toHaveLength(1);
    expect(r.byOccurrenceId.get('o1')?.window.id).toBe('w1');
    expect(r.byWindowId.get('w1')).toHaveLength(1);
  });

  it('groups several conflicting occurrences under one window', () => {
    const r = derive({
      occurrences: [occ({ id: 'o1' }), occ({ id: 'o2', scheduled_at: '2026-08-04T09:00:00Z' })],
      windows: [win()],
    });
    expect(r.byWindowId.get('w1')).toHaveLength(2);
  });

  // CoverState mirrors request_coverage's own preconditions, so the UI never
  // offers a button whose RPC would immediately reject.
  describe('coverState', () => {
    it('is available for a future scheduled occurrence with no request', () => {
      const r = derive({ occurrences: [occ()], windows: [win()] });
      expect(r.byOccurrenceId.get('o1')?.coverState).toBe('available');
    });

    it('is requested when I already have an open cover request', () => {
      const r = derive({ occurrences: [occ()], windows: [win()], mine: new Set(['o1']) });
      expect(r.byOccurrenceId.get('o1')?.coverState).toBe('requested');
    });

    it('is ineligible once the occurrence has started', () => {
      const r = derive({
        occurrences: [occ()],
        windows: [win()],
        now: new Date('2026-08-03T09:30:00Z'),
      });
      const c = r.byOccurrenceId.get('o1');
      expect(c?.coverState).toBe('ineligible');
      expect(c?.ineligibleReason).toBe('in-progress');
    });

    it('is ineligible when the occurrence is not scheduled (e.g. owner override)', () => {
      const r = derive({ occurrences: [occ({ status: 'overridden' })], windows: [win()] });
      const c = r.byOccurrenceId.get('o1');
      expect(c?.coverState).toBe('ineligible');
      expect(c?.ineligibleReason).toBe('not-scheduled');
    });

    it('is ineligible when someone else already has a pending request on it', () => {
      const r = derive({ occurrences: [occ()], windows: [win()], others: new Set(['o1']) });
      const c = r.byOccurrenceId.get('o1');
      expect(c?.coverState).toBe('ineligible');
      expect(c?.ineligibleReason).toBe('other-request-pending');
    });

    it('reports my own request even when the occurrence has started', () => {
      const r = derive({
        occurrences: [occ()],
        windows: [win()],
        mine: new Set(['o1']),
        now: new Date('2026-08-03T09:30:00Z'),
      });
      expect(r.byOccurrenceId.get('o1')?.coverState).toBe('requested');
    });
  });
});

describe('eachDateInclusive', () => {
  it('includes both endpoints', () => {
    expect(eachDateInclusive('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('returns a single date when start equals end', () => {
    expect(eachDateInclusive('2026-08-01', '2026-08-01')).toEqual(['2026-08-01']);
  });

  it('crosses a month boundary', () => {
    expect(eachDateInclusive('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('crosses a leap day', () => {
    expect(eachDateInclusive('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('returns empty when end precedes start', () => {
    expect(eachDateInclusive('2026-08-03', '2026-08-01')).toEqual([]);
  });
});

describe('rangesTouch', () => {
  it('detects an overlap', () => {
    expect(rangesTouch('2026-08-01', '2026-08-05', '2026-08-04', '2026-08-08')).toBe(true);
  });

  it('treats contiguous ranges as touching', () => {
    expect(rangesTouch('2026-08-01', '2026-08-05', '2026-08-06', '2026-08-08')).toBe(true);
  });

  it('rejects ranges with a clear gap', () => {
    expect(rangesTouch('2026-08-01', '2026-08-05', '2026-08-07', '2026-08-08')).toBe(false);
  });

  it('is symmetric', () => {
    expect(rangesTouch('2026-08-06', '2026-08-08', '2026-08-01', '2026-08-05')).toBe(true);
  });
});

describe('mergeRanges', () => {
  it('coalesces overlapping and contiguous ranges', () => {
    expect(
      mergeRanges([
        { start: '2026-08-04', end: '2026-08-08' },
        { start: '2026-08-01', end: '2026-08-05' },
        { start: '2026-08-09', end: '2026-08-10' },
        { start: '2026-09-01', end: '2026-09-02' },
      ]),
    ).toEqual([
      { start: '2026-08-01', end: '2026-08-10' },
      { start: '2026-09-01', end: '2026-09-02' },
    ]);
  });

  it('leaves a single range untouched', () => {
    expect(mergeRanges([{ start: '2026-08-01', end: '2026-08-02' }])).toEqual([
      { start: '2026-08-01', end: '2026-08-02' },
    ]);
  });

  it('returns empty for no input', () => {
    expect(mergeRanges([])).toEqual([]);
  });
});
