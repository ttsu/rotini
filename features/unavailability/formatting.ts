const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parses a yyyy-MM-dd away-window date into a Date for display.
 *
 * Anchored at midday deliberately. An away window is a calendar date with no
 * time, and `new Date('2026-08-01')` parses as UTC midnight — which is the
 * previous day for anyone west of Greenwich, so the label would be off by one.
 * Midday keeps the intended date whatever the device's offset and whichever
 * side of a DST change it falls on.
 */
function parseWindowDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/**
 * Formats an away window as a compact human range.
 *
 * Drops repetition where it is unambiguous: same day renders once, and a range
 * within one year only prints the year at the end.
 *
 * @returns e.g. "14 Jun – 20 Jun 2026", "1 Aug 2026", "28 Dec 2026 – 3 Jan 2027"
 */
export function formatDateRange(start: string, end: string): string {
  try {
    const s = parseWindowDate(start);
    const e = parseWindowDate(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;

    const sDay = `${s.getDate()} ${MONTHS[s.getMonth()]}`;
    const eDay = `${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;

    if (start === end) return `${sDay} ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear()) return `${sDay} – ${eDay}`;
    return `${sDay} ${s.getFullYear()} – ${eDay}`;
  } catch {
    return `${start} – ${end}`;
  }
}

/**
 * Inclusive length of an away window in days.
 *
 * @returns At least 1 for a valid window, 0 when the range is inverted
 */
export function countDays(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * "4 days" / "1 day", for window subtitles.
 */
export function formatDayCount(start: string, end: string): string {
  const n = countDays(start, end);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
