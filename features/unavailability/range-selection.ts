import type { AwayWindow } from './conflicts';
import { windowOnDate } from './calendar-marks';

/** In-progress calendar drag. `anchor` is the first day tapped. */
export type DraftRange = { anchor: string; start: string; end: string };

export type DayPressResult =
  /** Nothing has been drawn yet, or a second tap completed the range. */
  | { kind: 'draft'; draft: DraftRange }
  /** The tap landed on a saved window — open it for editing instead. */
  | { kind: 'edit'; window: AwayWindow };

/**
 * Decides what a tap on the availability calendar means.
 *
 * Rules, in order:
 *   1. With no draft in progress, tapping inside a saved window edits that
 *      window rather than starting a new range on top of it. Once a draft is
 *      underway the tap always extends it, so a range can be drawn across an
 *      existing window (the server merges them).
 *   2. The first tap anchors a single-day range.
 *   3. The second tap completes it, normalised — so dragging backwards works
 *      exactly like dragging forwards.
 *
 * Pure so the ordering can be tested without a calendar.
 */
export function handleDayPress(args: {
  date: string;
  draft: DraftRange | null;
  windows: AwayWindow[];
}): DayPressResult {
  const { date, draft, windows } = args;

  if (!draft) {
    const existing = windowOnDate(windows, date);
    if (existing) return { kind: 'edit', window: existing };
    return { kind: 'draft', draft: { anchor: date, start: date, end: date } };
  }

  const start = date < draft.anchor ? date : draft.anchor;
  const end = date < draft.anchor ? draft.anchor : date;
  return { kind: 'draft', draft: { anchor: draft.anchor, start, end } };
}

/**
 * The saved windows a draft range would be merged into on save.
 *
 * Mirrors the ±1 day contiguity rule in _unavailability_upsert_merged, so the
 * sheet can warn "this will merge with your 3–7 Aug window" before the server
 * silently widens what the user drew.
 */
export function windowsMergedBy(
  windows: AwayWindow[],
  range: { start: string; end: string },
  excludeId?: string,
): AwayWindow[] {
  return windows.filter((w) => {
    if (excludeId && w.id === excludeId) return false;
    return rangeTouchesWindow(range, w);
  });
}

function rangeTouchesWindow(range: { start: string; end: string }, w: AwayWindow): boolean {
  const dayBefore = shiftDate(range.start, -1);
  const dayAfter = shiftDate(range.end, 1);
  return w.start_date <= dayAfter && w.end_date >= dayBefore;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The range that will actually be stored once merging is applied.
 *
 * @returns The union of the draft and every window it touches
 */
export function mergedResult(
  windows: AwayWindow[],
  range: { start: string; end: string },
  excludeId?: string,
): { start: string; end: string } {
  const merged = windowsMergedBy(windows, range, excludeId);
  let { start, end } = range;
  for (const w of merged) {
    if (w.start_date < start) start = w.start_date;
    if (w.end_date > end) end = w.end_date;
  }
  return { start, end };
}
