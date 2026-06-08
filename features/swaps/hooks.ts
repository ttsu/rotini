import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import {
  pendingSwapForMeSchema,
  pendingSwapSentSchema,
  rpcOccurrenceRefSchema,
  swapRequestDetailSchema,
  type PendingSwapForMe,
  type PendingSwapSent,
  type SwapRequestDetail,
} from '@/lib/api-schemas/swaps';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/features/rotas/query-keys';

export type { PendingSwapForMe, PendingSwapSent, SwapRequestDetail };

/** All pending swap requests for a specific occurrence (any requester, any target). */
export function usePendingSwapsForOccurrence(occurrenceId: string | null | undefined) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.swaps.pendingForOccurrence(occurrenceId ?? '');

  useEffect(() => {
    if (!session || !occurrenceId) return;
    const channel = supabase
      .channel(`swap-occ:${occurrenceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swap_requests',
          filter: `occurrence_id=eq.${occurrenceId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [occurrenceId, session?.user.id, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<SwapRequestDetail[]> => {
      const { data, error } = await supabase
        .from('swap_requests')
        .select(
          'id, occurrence_id, requester_id, target_user_id, message, status, kind, created_at, decided_at,' +
            'requester:profiles!swap_requests_requester_id_fkey(display_name),' +
            'target:profiles!swap_requests_target_user_id_fkey(display_name)',
        )
        .eq('occurrence_id', occurrenceId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      return rows.map((row, i) => {
        const r = swapRequestDetailSchema.safeParse(row);
        if (!r.success) {
          if (__DEV__) console.warn('[pending-swaps-occ] row', i, r.error.flatten());
          throw new Error('Invalid swap shape from server.');
        }
        return r.data;
      });
    },
    enabled: !!session && !!occurrenceId,
  });
}

/** Pending swaps where the current user is the target (incoming requests). */
export function usePendingSwapsForMe() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.swaps.pendingForMe();
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    // supabase.channel() returns an existing subscribed channel if the topic
    // already exists in its internal list. removeChannel is async, so a stale
    // channel lingers between cleanup and the next effect, causing .on() to throw.
    // Date.now() as suffix guarantees a fresh channel instance on every mount.
    const channel = supabase
      .channel(`swap-inbox:${uid}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swap_requests',
          filter: `target_user_id=eq.${uid}`,
        },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<PendingSwapForMe[]> => {
      const { data, error } = await supabase
        .from('swap_requests')
        .select(
          'id, occurrence_id, requester_id, message, created_at,' +
            'requester:profiles!swap_requests_requester_id_fkey(display_name),' +
            'occurrence:occurrences(scheduled_at, ends_at, rota_id, rota:rotas!occurrences_rota_id_fkey(name, tz))',
        )
        .eq('target_user_id', session!.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      return rows.map((row, i) => {
        const r = pendingSwapForMeSchema.safeParse(row);
        if (!r.success) {
          if (__DEV__) console.warn('[pending-swaps] row', i, r.error.flatten());
          throw new Error('Invalid swap inbox shape from server.');
        }
        return r.data;
      });
    },
    enabled: !!session,
  });
}

/** Pending swaps where the current user is the requester (outgoing requests). */
export function usePendingSentSwaps() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.swaps.pendingSent();

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const channel = supabase
      .channel('swap-sent')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swap_requests',
          filter: `requester_id=eq.${uid}`,
        },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<PendingSwapSent[]> => {
      const { data, error } = await supabase
        .from('swap_requests')
        .select(
          'id, occurrence_id, target_user_id, message, kind, created_at,' +
            'target:profiles!swap_requests_target_user_id_fkey(display_name),' +
            'occurrence:occurrences(scheduled_at, ends_at, rota_id, rota:rotas!occurrences_rota_id_fkey(name, tz))',
        )
        .eq('requester_id', session!.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      return rows.map((row, i) => {
        const r = pendingSwapSentSchema.safeParse(row);
        if (!r.success) {
          if (__DEV__) console.warn('[pending-swaps-sent] row', i, r.error.flatten());
          throw new Error('Invalid sent-swap shape from server.');
        }
        return r.data;
      });
    },
    enabled: !!session,
  });
}

export function useRequestSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      targetUserId,
      message,
    }: {
      occurrenceId: string;
      targetUserId?: string | null;
      message?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('request_swap', {
        p_occurrence_id: occurrenceId,
        p_target_user_id: targetUserId ?? undefined,
        p_message: message ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { occurrenceId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occurrenceId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.swaps.pendingForOccurrence(occurrenceId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingSent() });
    },
  });
}

export function useRespondSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ swapId, accept }: { swapId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc('respond_swap', {
        p_swap_request_id: swapId,
        p_accept: accept,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const row = rpcOccurrenceRefSchema.safeParse(data);
      const occ = row.success ? row.data : null;
      if (occ?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occ.id) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.swaps.pendingForOccurrence(occ.id),
        });
      }
      if (occ?.rota_id)
        queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(occ.rota_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() });
    },
  });
}

export function useCancelSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ swapId }: { swapId: string }) => {
      const { error } = await supabase.rpc('cancel_swap', {
        p_swap_request_id: swapId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingSent() });
    },
  });
}

export function useClaimPendingSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ occurrenceId }: { occurrenceId: string }) => {
      const { data, error } = await supabase.rpc('claim_pending_slot', {
        p_occurrence_id: occurrenceId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, { occurrenceId }) => {
      const row = rpcOccurrenceRefSchema.safeParse(data);
      const occ = row.success ? row.data : null;
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occurrenceId) });
      if (occ?.rota_id)
        queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(occ.rota_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() });
    },
  });
}

export function useOverrideOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      newAssigneeId,
      reason,
    }: {
      occurrenceId: string;
      newAssigneeId: string;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('override_occurrence', {
        p_occurrence_id: occurrenceId,
        p_new_assignee_id: newAssigneeId,
        p_reason: reason ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, { occurrenceId }) => {
      const row = rpcOccurrenceRefSchema.safeParse(data);
      const occ = row.success ? row.data : null;
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occurrenceId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.swaps.pendingForOccurrence(occurrenceId),
      });
      if (occ?.rota_id)
        queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(occ.rota_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingSent() });
    },
  });
}
