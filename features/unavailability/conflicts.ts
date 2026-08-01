import { formatInTimeZone } from 'date-fns-tz';

/** An away window belonging to the current user. */
export type AwayWindow = {
  id: string;
  start_date: string;
  end_date: string;
  /** IANA tz the dates are expressed in, captured when the window was created. */
  tz: string;
  reason?: string | null;
};

/** The slice of an occurrence the conflict logic needs. */
export type ConflictOcc = {
  id: string;
  rota_id: string;
  scheduled_at: string;
  ends_at: string;
  status: string;
  rota: { name: string; tz: string } | null;
};

/**
 * Whether the user can throw this shift open for cover.
 *
 * Mirrors the preconditions request_coverage enforces
 * (supabase/migrations/20260614000002_open_coverage.sql): the occurrence must
 * be `scheduled`, must start in the future, and must not already carry an
 * open/pending request. Deriving it here keeps the UI from offering a button
 * whose RPC would immediately reject.
 */
export type CoverState = 'available' | 'requested' | 'ineligible';

export type IneligibleReason = 'in-progress' | 'not-scheduled' | 'other-request-pending';

export type Conflict = {
  occurrence: ConflictOcc;
  window: AwayWindow;
  coverState: CoverState;
  ineligibleReason?: IneligibleReason;
};

/**
 * THE conflict rule. Mirrors isUserAbsent() in
 * supabase/functions/materialize-rota/index.ts — keep the two in step.
 *
 * An occurrence conflicts with a window iff its start instant, rendered in the
 * WINDOW's tz, lands on a date within [start_date, end_date] inclusive.
 *
 * Deliberately not `occurrences.scheduled_local_date`: that column holds the
 * date in the *rota's* tz, while an away window is a statement about the
 * *person's* days. A London member away 1–7 Aug cannot take an Auckland turn
 * at 09:00 on 8 Aug local, because that instant is 22:00 on the 7th for them.
 *
 * Known limitation, matching the materializer: this tests the start instant
 * only, not [scheduled_at, ends_at) overlap. A back-to-back turn beginning the
 * day before a window and running into it will not be flagged.
 *
 * @param windows - The user's away windows
 * @param scheduledAtIso - Occurrence start as an ISO instant
 * @returns The first covering window, or null
 */
export function windowCovering(windows: AwayWindow[], scheduledAtIso: string): AwayWindow | null {
  for (const w of windows) {
    const dateInWindowTz = formatInTimeZone(new Date(scheduledAtIso), w.tz, 'yyyy-MM-dd');
    if (dateInWindowTz >= w.start_date && dateInWindowTz <= w.end_date) return w;
  }
  return null;
}

function coverStateFor(
  occurrence: ConflictOcc,
  myOpenCoverageOccurrenceIds: Set<string>,
  otherPendingOccurrenceIds: Set<string>,
  now: Date,
): { coverState: CoverState; ineligibleReason?: IneligibleReason } {
  // My own outstanding request wins the display, even once the turn has begun —
  // "waiting for a taker" is more useful than "too late".
  if (myOpenCoverageOccurrenceIds.has(occurrence.id)) return { coverState: 'requested' };
  if (new Date(occurrence.scheduled_at).getTime() <= now.getTime()) {
    return { coverState: 'ineligible', ineligibleReason: 'in-progress' };
  }
  if (occurrence.status !== 'scheduled') {
    return { coverState: 'ineligible', ineligibleReason: 'not-scheduled' };
  }
  if (otherPendingOccurrenceIds.has(occurrence.id)) {
    return { coverState: 'ineligible', ineligibleReason: 'other-request-pending' };
  }
  return { coverState: 'available' };
}

/**
 * Pairs the user's occurrences against their away windows.
 *
 * Pure by design — `now` and the in-flight request ids are passed in so the
 * whole thing is testable and can be reused for the pre-save preview, where
 * the window does not exist in the database yet.
 *
 * @returns The conflicts plus lookups keyed by occurrence and by window
 */
export function deriveConflicts(args: {
  occurrences: ConflictOcc[];
  windows: AwayWindow[];
  myOpenCoverageOccurrenceIds: Set<string>;
  otherPendingOccurrenceIds: Set<string>;
  now: Date;
}): {
  all: Conflict[];
  byOccurrenceId: Map<string, Conflict>;
  byWindowId: Map<string, Conflict[]>;
} {
  const all: Conflict[] = [];
  const byOccurrenceId = new Map<string, Conflict>();
  const byWindowId = new Map<string, Conflict[]>();

  for (const occurrence of args.occurrences) {
    const window = windowCovering(args.windows, occurrence.scheduled_at);
    if (!window) continue;

    const conflict: Conflict = {
      occurrence,
      window,
      ...coverStateFor(
        occurrence,
        args.myOpenCoverageOccurrenceIds,
        args.otherPendingOccurrenceIds,
        args.now,
      ),
    };

    all.push(conflict);
    byOccurrenceId.set(occurrence.id, conflict);
    const forWindow = byWindowId.get(window.id);
    if (forWindow) forWindow.push(conflict);
    else byWindowId.set(window.id, [conflict]);
  }

  return { all, byOccurrenceId, byWindowId };
}

// ── Plain yyyy-MM-dd helpers ─────────────────────────────────────────────────
// Away windows are calendar dates, not instants. These operate on the string
// form via UTC arithmetic so a device in any tz produces the same answer.

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every date from start to end inclusive.
 *
 * @returns Ascending yyyy-MM-dd strings; empty when end precedes start
 */
export function eachDateInclusive(start: string, end: string): string[] {
  const startMs = toUtcMs(start);
  const endMs = toUtcMs(end);
  if (endMs < startMs) return [];
  const out: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) out.push(fromUtcMs(ms));
  return out;
}

/**
 * Whether two date ranges overlap or merely abut.
 *
 * The ±1 day of slack is what makes 1–5 and 6–8 count as one continuous
 * absence, matching the merge rule in _unavailability_upsert_merged.
 */
export function rangesTouch(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toUtcMs(aStart) <= toUtcMs(bEnd) + DAY_MS && toUtcMs(aEnd) >= toUtcMs(bStart) - DAY_MS;
}

/**
 * Coalesces overlapping and contiguous ranges into a minimal disjoint set.
 *
 * @returns Ranges sorted ascending by start
 */
export function mergeRanges(
  ranges: { start: string; end: string }[],
): { start: string; end: string }[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const out: { start: string; end: string }[] = [{ ...sorted[0] }];
  for (const range of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (rangesTouch(last.start, last.end, range.start, range.end)) {
      if (toUtcMs(range.end) > toUtcMs(last.end)) last.end = range.end;
    } else {
      out.push({ ...range });
    }
  }
  return out;
}
