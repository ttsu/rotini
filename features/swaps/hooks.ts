import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import {
  pendingSwapForMeSchema,
  rpcOccurrenceRefSchema,
  swapRequestDetailSchema,
  type PendingSwapForMe,
  type SwapRequestDetail,
} from '@/lib/api-schemas/swaps';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/features/rotas/query-keys';

export type { PendingSwapForMe, SwapRequestDetail };

export function useSwapRequest(swapId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.swaps.detail(swapId),
    queryFn: async (): Promise<SwapRequestDetail> => {
      const { data, error } = await supabase
        .from('swap_requests')
        .select(
          'id, occurrence_id, requester_id, target_user_id, message, status, created_at, decided_at,' +
            'requester:profiles!swap_requests_requester_id_fkey(display_name),' +
            'target:profiles!swap_requests_target_user_id_fkey(display_name)'
        )
        .eq('id', swapId!)
        .single();
      if (error) throw error;
      return swapRequestDetailSchema.parse(data);
    },
    enabled: !!session && !!swapId,
  });
}

export function usePendingSwapsForMe() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.swaps.pendingForMe();

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const channel = supabase
      .channel('swap-inbox')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'swap_requests',
          filter: `target_user_id=eq.${uid}`,
        },
        () => queryClient.invalidateQueries({ queryKey: key })
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
            'occurrence:occurrences(scheduled_at, ends_at, rota_id, rota:rotas!occurrences_rota_id_fkey(name, tz))'
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

export function useRequestSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      targetUserId,
      message,
    }: {
      occurrenceId: string;
      targetUserId: string;
      message?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('request_swap', {
        p_occurrence_id: occurrenceId,
        p_target_user_id: targetUserId,
        p_message: message ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { occurrenceId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occurrenceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.all() });
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
    onSuccess: (data, { swapId }) => {
      const row = rpcOccurrenceRefSchema.safeParse(data);
      const occ = row.success ? row.data : null;
      if (occ?.id) queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.detail(occ.id) });
      if (occ?.rota_id) queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(occ.rota_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.detail(swapId) });
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
    onSuccess: (_data, { swapId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.detail(swapId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() });
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
      if (occ?.rota_id) queryClient.invalidateQueries({ queryKey: queryKeys.occurrences.forRota(occ.rota_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeRotas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.swaps.pendingForMe() });
    },
  });
}
