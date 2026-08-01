import { describe, expect, it } from 'vitest';

import {
  AWAY_COLOR,
  AWAY_PAST_COLOR,
  CONFLICT_DOT,
  DRAFT_COLOR,
  SHIFT_DOT,
  buildCalendarMarks,
  windowOnDate,
} from './calendar-marks';
import type { AwayWindow, Conflict, ConflictOcc } from './conflicts';

const TODAY = '2026-08-01';

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

function conflictFor(occId: string, scheduledAt: string, window: AwayWindow): Conflict {
  const occurrence: ConflictOcc = {
    id: occId,
    rota_id: 'r1',
    scheduled_at: scheduledAt,
    ends_at: scheduledAt,
    status: 'scheduled',
    rota: { name: 'Kitchen', tz: 'Europe/London' },
  };
  return { occurrence, window, coverState: 'available' };
}

function build(over: Partial<Parameters<typeof buildCalendarMarks>[0]> = {}) {
  return buildCalendarMarks({
    windows: [],
    conflicts: [],
    shifts: [],
    userTz: 'Europe/London',
    todayIso: TODAY,
    draft: null,
    ...over,
  });
}

describe('buildCalendarMarks', () => {
  it('shades every day of a window and caps the ends', () => {
    const marks = build({ windows: [win()] });
    expect(marks['2026-08-10']).toMatchObject({ color: AWAY_COLOR, startingDay: true, endingDay: false });
    expect(marks['2026-08-11']).toMatchObject({ color: AWAY_COLOR, startingDay: false, endingDay: false });
    expect(marks['2026-08-12']).toMatchObject({ color: AWAY_COLOR, startingDay: false, endingDay: true });
    expect(marks['2026-08-13']).toBeUndefined();
  });

  it('caps both ends on a single-day window', () => {
    const marks = build({ windows: [win({ start_date: '2026-08-10', end_date: '2026-08-10' })] });
    expect(marks['2026-08-10']).toMatchObject({ startingDay: true, endingDay: true });
  });

  it('dims a window that is wholly in the past', () => {
    const marks = build({ windows: [win({ start_date: '2026-07-01', end_date: '2026-07-03' })] });
    expect(marks['2026-07-02'].color).toBe(AWAY_PAST_COLOR);
  });

  it('dots a clear shift teal', () => {
    const marks = build({ shifts: [{ id: 'o1', scheduled_at: '2026-08-20T09:00:00Z' }] });
    expect(marks['2026-08-20']).toMatchObject({ marked: true, dotColor: SHIFT_DOT });
  });

  it('dots a clashing shift red, on the shaded day, without losing the band', () => {
    const w = win();
    const marks = build({
      windows: [w],
      shifts: [{ id: 'o1', scheduled_at: '2026-08-11T09:00:00Z' }],
      conflicts: [conflictFor('o1', '2026-08-11T09:00:00Z', w)],
    });
    // The period band and the dot have to coexist in one cell.
    expect(marks['2026-08-11']).toMatchObject({
      color: AWAY_COLOR,
      marked: true,
      dotColor: CONFLICT_DOT,
    });
  });

  it('keys a clashing shift in the window tz, not the user tz', () => {
    // 21:00Z on the 12th is the 13th in Auckland but still the 12th in London.
    // The user is in Auckland; the window is London. The dot must land on the
    // shaded London day, otherwise it would sit outside the band.
    const w = win({ tz: 'Europe/London', start_date: '2026-08-10', end_date: '2026-08-12' });
    const marks = build({
      userTz: 'Pacific/Auckland',
      windows: [w],
      shifts: [{ id: 'o1', scheduled_at: '2026-08-12T21:00:00Z' }],
      conflicts: [conflictFor('o1', '2026-08-12T21:00:00Z', w)],
    });
    expect(marks['2026-08-12']).toMatchObject({ dotColor: CONFLICT_DOT });
    expect(marks['2026-08-13']?.marked).toBeUndefined();
  });

  it('keys a clear shift in the user tz', () => {
    const marks = build({
      userTz: 'Pacific/Auckland',
      shifts: [{ id: 'o1', scheduled_at: '2026-08-20T21:00:00Z' }],
    });
    expect(marks['2026-08-21']).toMatchObject({ dotColor: SHIFT_DOT });
  });

  it('lets the draft override a saved window underneath', () => {
    const marks = build({
      windows: [win()],
      draft: { start: '2026-08-11', end: '2026-08-14' },
    });
    expect(marks['2026-08-11'].color).toBe(DRAFT_COLOR);
    expect(marks['2026-08-14']).toMatchObject({ color: DRAFT_COLOR, endingDay: true });
    // The part of the window the draft doesn't reach keeps its own shading.
    expect(marks['2026-08-10'].color).toBe(AWAY_COLOR);
  });

  it('returns an empty map when there is nothing to show', () => {
    expect(build()).toEqual({});
  });
});

describe('windowOnDate', () => {
  it('finds the window covering a date, inclusive of both ends', () => {
    expect(windowOnDate([win()], '2026-08-10')?.id).toBe('w1');
    expect(windowOnDate([win()], '2026-08-12')?.id).toBe('w1');
  });

  it('returns null just outside the window', () => {
    expect(windowOnDate([win()], '2026-08-09')).toBeNull();
    expect(windowOnDate([win()], '2026-08-13')).toBeNull();
  });
});
