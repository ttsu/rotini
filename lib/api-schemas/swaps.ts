import { z } from 'zod';

export const swapRequestDetailSchema = z.object({
  id: z.string(),
  occurrence_id: z.string(),
  requester_id: z.string(),
  target_user_id: z.string(),
  message: z.string().nullable(),
  status: z.string(),
  kind: z.string(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
  requester: z.object({ display_name: z.string().nullable() }).nullable(),
  target: z.object({ display_name: z.string().nullable() }).nullable(),
});

export type SwapRequestDetail = z.infer<typeof swapRequestDetailSchema>;

export const pendingSwapForMeSchema = z.object({
  id: z.string(),
  occurrence_id: z.string(),
  requester_id: z.string(),
  message: z.string().nullable(),
  created_at: z.string(),
  requester: z.object({ display_name: z.string().nullable() }).nullable(),
  occurrence: z
    .object({
      scheduled_at: z.string(),
      ends_at: z.string(),
      rota_id: z.string(),
      rota: z
        .object({
          name: z.string(),
          tz: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

export type PendingSwapForMe = z.infer<typeof pendingSwapForMeSchema>;

/** A pending swap the current user sent as requester. */
export const pendingSwapSentSchema = z.object({
  id: z.string(),
  occurrence_id: z.string(),
  target_user_id: z.string(),
  message: z.string().nullable(),
  kind: z.string(),
  created_at: z.string(),
  target: z.object({ display_name: z.string().nullable() }).nullable(),
  occurrence: z
    .object({
      scheduled_at: z.string(),
      ends_at: z.string(),
      rota_id: z.string(),
      rota: z
        .object({
          name: z.string(),
          tz: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

export type PendingSwapSent = z.infer<typeof pendingSwapSentSchema>;

/** Minimal occurrence row returned by some swap RPCs for cache invalidation. */
export const rpcOccurrenceRefSchema = z
  .object({
    id: z.string().optional(),
    rota_id: z.string().optional(),
  })
  .passthrough();

export type RpcOccurrenceRef = z.infer<typeof rpcOccurrenceRefSchema>;
