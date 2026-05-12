/** AUTO-GENERATED from lib/rrule.ts — run `npm run sync-rrule` to regenerate. */
// deno-lint-ignore-file no-explicit-any

import { RRule } from 'https://esm.sh/rrule@2';
import { formatInTimeZone, fromZonedTime } from 'https://esm.sh/date-fns-tz@3';

export { formatInTimeZone };

// ─── Types & schema ───────────────────────────────────────────────────────────

export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

type RRuleParams =
  | { freq: 'DAILY'; interval: number }
  | { freq: 'WEEKLY'; interval: number; byday: WeekdayCode[] }
  | { freq: 'MONTHLY'; interval: number; bymonthday?: number; byday?: WeekdayCode; bysetpos?: number };

// ─── WEEKDAY_CODES → rrule.js Weekday ─────────────────────────────────────────

const WEEKDAY_MAP: Record<WeekdayCode, any> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

// ─── toRRule / fromRRule ──────────────────────────────────────────────────────

export function fromRRule(rruleStr: string): RRuleParams {
  const kv: Record<string, string> = {};
  for (const part of rruleStr.split(';')) {
    const eq = part.indexOf('=');
    kv[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const freq = kv['FREQ'] as 'DAILY' | 'WEEKLY' | 'MONTHLY';
  const interval = parseInt(kv['INTERVAL'] ?? '1', 10);

  if (freq === 'DAILY') return { freq, interval };

  if (freq === 'WEEKLY') {
    return { freq, interval, byday: kv['BYDAY'].split(',') as WeekdayCode[] };
  }

  // MONTHLY
  if (kv['BYMONTHDAY']) {
    return { freq, interval, bymonthday: parseInt(kv['BYMONTHDAY'], 10) };
  }
  return {
    freq,
    interval,
    byday: kv['BYDAY'] as WeekdayCode,
    bysetpos: parseInt(kv['BYSETPOS'], 10),
  };
}

// ─── Timezone-aware expansion ─────────────────────────────────────────────────

// Express a UTC date as a "naive" Date whose UTC value equals local wall-clock time.
// rrule.js is given these naive dates so it always generates events at the same
// wall-clock time regardless of DST transitions.
function toNaive(utcDate: Date, tz: string): Date {
  const localStr = formatInTimeZone(utcDate, tz, "yyyy-MM-dd'T'HH:mm:ss");
  return new Date(localStr + 'Z');
}

// Inverse of toNaive: treat naive UTC value as a local wall-clock time in tz
// and return the correct UTC instant.
function fromNaive(naiveDate: Date, tz: string): Date {
  // naiveDate.toISOString() looks like "2024-01-15T09:00:00.000Z"
  const localStr = naiveDate.toISOString().slice(0, 19); // "2024-01-15T09:00:00"
  return fromZonedTime(localStr, tz);
}

function buildRRule(rruleStr: string, dtstart: Date, tz: string): RRule {
  const params = fromRRule(rruleStr);
  const naiveDtstart = toNaive(dtstart, tz);

  const freqMap = { DAILY: RRule.DAILY, WEEKLY: RRule.WEEKLY, MONTHLY: RRule.MONTHLY };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    freq: freqMap[params.freq],
    interval: params.interval ?? 1,
    dtstart: naiveDtstart,
  };

  if (params.freq === 'WEEKLY') {
    options.byweekday = params.byday.map((d) => WEEKDAY_MAP[d]);
  } else if (params.freq === 'MONTHLY') {
    if (params.bymonthday != null) {
      options.bymonthday = [params.bymonthday];
    } else if (params.byday != null && params.bysetpos != null) {
      options.byweekday = [WEEKDAY_MAP[params.byday]];
      options.bysetpos = [params.bysetpos];
    }
  }

  return new RRule(options);
}

/**
 * Expand an RRULE string into concrete UTC Date instances within [range.from, range.to].
 * dtstart must be a UTC Date representing the rota's first occurrence start time.
 */
export function expand(
  rruleStr: string,
  dtstart: Date,
  tz: string,
  range: { from: Date; to: Date },
  maxCount = 200,
): Date[] {
  const rule = buildRRule(rruleStr, dtstart, tz);
  const naiveFrom = toNaive(range.from, tz);
  const naiveTo = toNaive(range.to, tz);
  const naive = rule.between(naiveFrom, naiveTo, true).slice(0, maxCount);
  return naive.map((d) => fromNaive(d, tz));
}

/**
 * Returns the smallest gap in minutes between any two consecutive occurrences
 * among the next `count` expansions from dtstart.
 * Returns null if fewer than 2 occurrences exist.
 */
export function smallestGapMinutes(
  rruleStr: string,
  dtstart: Date,
  tz: string,
  count = 50,
): number | null {
  const rule = buildRRule(rruleStr, dtstart, tz);
  const dates = rule.all((_, i) => i < count);
  if (dates.length < 2) return null;
  let min = Infinity;
  for (let i = 1; i < dates.length; i++) {
    const gapMs = dates[i].getTime() - dates[i - 1].getTime();
    if (gapMs < min) min = gapMs;
  }
  return min / 60_000;
}

