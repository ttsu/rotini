import { z } from 'zod';

/**
 * One of the current user's own upcoming turns, across every rota.
 *
 * Carries the rota's tz so times can be rendered in the rota's local time,
 * while the conflict rule itself evaluates in the away window's tz.
 */
export const myOccurrenceSchema = z.object({
  id: z.string(),
  rota_id: z.string(),
  scheduled_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  rota: z
    .object({
      name: z.string(),
      tz: z.string(),
    })
    .nullable(),
});

export type MyOccurrence = z.infer<typeof myOccurrenceSchema>;

/**
 * Parses the current user's upcoming occurrences.
 *
 * @param raw - `occurrences` array from PostgREST
 */
export function parseMyOccurrences(raw: unknown): MyOccurrence[] {
  const r = z.array(myOccurrenceSchema).safeParse(raw);
  if (!r.success) {
    if (__DEV__) console.warn('[my-occurrences] shape', r.error.flatten());
    throw new Error('Invalid occurrence shape from server.');
  }
  return r.data;
}
