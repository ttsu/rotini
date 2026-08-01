import { formatInTimeZone } from 'date-fns-tz';

import { eachDateInclusive, type AwayWindow, type Conflict } from './conflicts';

/** Subset of react-native-calendars' period marking we actually use. */
export type CalendarMark = {
  color?: string;
  textColor?: string;
  startingDay?: boolean;
  endingDay?: boolean;
  marked?: boolean;
  dotColor?: string;
};

export const AWAY_COLOR = '#FF9F0A';
/** Past windows are dimmed — still visible as history, but not competing. */
export const AWAY_PAST_COLOR = 'rgba(255,159,10,0.35)';
export const DRAFT_COLOR = '#0a7ea4';
export const SHIFT_DOT = '#0a7ea4';
export const CONFLICT_DOT = '#FF3B30';

export type ShiftForMarks = {
  id: string;
  scheduled_at: string;
};

/**
 * Builds the `markedDates` map for the Availability calendar.
 *
 * Layering matters — later writes win:
 *   1. saved away windows, as a shaded band (dimmed when wholly in the past)
 *   2. teal dots for the user's shifts that are fine
 *   3. red dots for shifts that clash, so the dot sits inside the band
 *   4. the in-progress drag, which overrides everything beneath it
 *
 * Conflicting shifts are keyed in their window's tz so the dot lands on the
 * shaded day; everything else is keyed in the user's current tz, since this is
 * the user's own calendar. A shift is only ever dotted once, so the two rules
 * cannot double-place it.
 *
 * @param todayIso - Today as yyyy-MM-dd, for deciding which windows are past
 */
export function buildCalendarMarks(args: {
  windows: AwayWindow[];
  conflicts: Conflict[];
  shifts: ShiftForMarks[];
  userTz: string;
  todayIso: string;
  draft: { start: string; end: string } | null;
}): Record<string, CalendarMark> {
  const marks: Record<string, CalendarMark> = {};

  // 1. Saved windows
  for (const w of args.windows) {
    const isPast = w.end_date < args.todayIso;
    const color = isPast ? AWAY_PAST_COLOR : AWAY_COLOR;
    for (const date of eachDateInclusive(w.start_date, w.end_date)) {
      marks[date] = {
        ...marks[date],
        color,
        textColor: '#FFFFFF',
        startingDay: date === w.start_date,
        endingDay: date === w.end_date,
      };
    }
  }

  // 2 + 3. Shift dots. Conflicting shifts get the red dot in the window's tz.
  const conflictByOccId = new Map(args.conflicts.map((c) => [c.occurrence.id, c]));
  for (const shift of args.shifts) {
    const conflict = conflictByOccId.get(shift.id);
    const tz = conflict ? conflict.window.tz : args.userTz;
    const date = formatInTimeZone(new Date(shift.scheduled_at), tz, 'yyyy-MM-dd');
    marks[date] = {
      ...marks[date],
      marked: true,
      dotColor: conflict ? CONFLICT_DOT : SHIFT_DOT,
    };
  }

  // 4. Draft selection
  if (args.draft) {
    for (const date of eachDateInclusive(args.draft.start, args.draft.end)) {
      marks[date] = {
        ...marks[date],
        color: DRAFT_COLOR,
        textColor: '#FFFFFF',
        startingDay: date === args.draft.start,
        endingDay: date === args.draft.end,
      };
    }
  }

  return marks;
}

/**
 * The saved window containing a date, if any — used to turn a tap on a shaded
 * day into "edit this window" rather than "start a new range".
 */
export function windowOnDate(windows: AwayWindow[], date: string): AwayWindow | null {
  return windows.find((w) => date >= w.start_date && date <= w.end_date) ?? null;
}
