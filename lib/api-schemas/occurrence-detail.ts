import { z } from 'zod';

export const occurrenceDetailSchema = z.object({
  id: z.string(),
  rota_id: z.string(),
  scheduled_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  assigned_user_id: z.string().nullable(),
  original_assignee_id: z.string().nullable(),
  override_reason: z.string().nullable(),
  swap_request_id: z.string().nullable(),
  rota: z
    .object({
      name: z.string(),
      tz: z.string(),
    })
    .nullable(),
  assignee: z
    .object({
      display_name: z.string().nullable(),
    })
    .nullable(),
});

export type OccurrenceDetail = z.infer<typeof occurrenceDetailSchema>;

export const rotaMemberEmbedSchema = z.object({
  user_id: z.string(),
  role: z.string(),
  is_manager: z.boolean().default(false),
  profile: z.object({ id: z.string(), display_name: z.string().nullable() }).nullable(),
});

export type RotaMemberEmbed = z.infer<typeof rotaMemberEmbedSchema>;

/**
 * Parses occurrence detail query result.
 *
 * @param data - Raw Supabase row
 */
export function parseOccurrenceDetail(data: unknown): OccurrenceDetail {
  return occurrenceDetailSchema.parse(data);
}

/**
 * Parses rota member rows from `useRotaData` embed.
 *
 * @param raw - `rota_members` array from PostgREST
 */
export function parseRotaMemberEmbeds(raw: unknown): RotaMemberEmbed[] {
  const r = z.array(rotaMemberEmbedSchema).safeParse(raw);
  if (!r.success) {
    if (__DEV__) console.warn('[occurrence] rota_members shape', r.error.flatten());
    return [];
  }
  return r.data;
}
