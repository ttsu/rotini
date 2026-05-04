import { z } from 'zod';

/** Nested `rotas` row returned from `rota_members` select with embed. */
export const homeRotaEmbedSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tz: z.string(),
  duration_minutes: z.number().nullable(),
  back_to_back: z.boolean(),
});

export type HomeRotaEmbed = z.infer<typeof homeRotaEmbedSchema>;

export const rotaMemberHomeRowSchema = z.object({
  role: z.string(),
  rota: homeRotaEmbedSchema.nullable(),
});

export type RotaMemberHomeRow = z.infer<typeof rotaMemberHomeRowSchema>;

/**
 * Parses a PostgREST row; returns null if shape is invalid (logged in dev).
 *
 * @param row - Raw row from Supabase
 */
export function parseRotaMemberHomeRow(row: unknown): RotaMemberHomeRow | null {
  const r = rotaMemberHomeRowSchema.safeParse(row);
  if (!r.success) {
    if (__DEV__) console.warn('[home-rota] invalid row', r.error.flatten());
    return null;
  }
  return r.data;
}
