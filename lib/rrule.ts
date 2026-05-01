/**
 * RRULE utilities for rotini.
 *
 * Supported subset: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY, BYMONTHDAY, BYSETPOS.
 *
 * Timezone strategy: rrule.js is given "naive" dates (local time expressed as UTC) so
 * it always produces the same wall-clock time regardless of DST transitions.
 * toNaive/fromNaive handles the round-trip via date-fns-tz.
 *
 * Note: the shared Deno counterpart lives in supabase/functions/_shared/rrule.ts
 * and duplicates this logic using npm: imports.
 */

import { RRule } from 'rrule';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';

// ─── Types & schema ───────────────────────────────────────────────────────────

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const rruleParamsSchema = z.discriminatedUnion('freq', [
  z.object({
    freq: z.literal('DAILY'),
    interval: z.coerce.number().int().min(1).default(1),
  }),
  z.object({
    freq: z.literal('WEEKLY'),
    interval: z.coerce.number().int().min(1).default(1),
    byday: z.array(z.enum(WEEKDAY_CODES)).min(1),
  }),
  z.object({
    freq: z.literal('MONTHLY'),
    interval: z.coerce.number().int().min(1).default(1),
    bymonthday: z.coerce.number().int().min(1).max(31).optional(),
    byday: z.enum(WEEKDAY_CODES).optional(),
    bysetpos: z.coerce.number().int().min(-4).max(4).optional(),
  }).refine(
    (d) => d.bymonthday != null || (d.byday != null && d.bysetpos != null),
    'Monthly recurrence requires bymonthday or both byday and bysetpos',
  ),
]);

export type RRuleParams = z.infer<typeof rruleParamsSchema>;

// ─── WEEKDAY_CODES → rrule.js Weekday ─────────────────────────────────────────

const WEEKDAY_MAP = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
} as const;

// ─── toRRule / fromRRule ──────────────────────────────────────────────────────

export function toRRule(params: RRuleParams): string {
  const parts = [`FREQ=${params.freq}`, `INTERVAL=${params.interval ?? 1}`];
  if (params.freq === 'WEEKLY') {
    parts.push(`BYDAY=${params.byday.join(',')}`);
  } else if (params.freq === 'MONTHLY') {
    if (params.bymonthday != null) {
      parts.push(`BYMONTHDAY=${params.bymonthday}`);
    } else {
      parts.push(`BYDAY=${params.byday}`, `BYSETPOS=${params.bysetpos}`);
    }
  }
  return parts.join(';');
}

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

/**
 * Returns an error message if duration_minutes would cause overlapping occurrences,
 * or null if valid.
 */
export function validateDuration(
  rruleStr: string,
  dtstart: Date,
  tz: string,
  durationMinutes: number,
): string | null {
  const gap = smallestGapMinutes(rruleStr, dtstart, tz);
  if (gap == null) return null; // can't validate without ≥2 occurrences
  if (durationMinutes >= gap) {
    const gapHours = (gap / 60).toFixed(1);
    return `Duration must be shorter than the time between turns (${gapHours}h)`;
  }
  return null;
}
