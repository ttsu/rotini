import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

export type SwapRequestDetail = {
  id: string;
  occurrence_id: string;
  requester_id: string;
  target_user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  requester: { display_name: string | null } | null;
  target: { display_name: string | null } | null;
};

export type PendingSwapForMe = {
  id: string;
  occurrence_id: string;
  requester_id: string;
  message: string | null;
  created_at: string;
  requester: { display_name: string | null } | null;
  occurrence: {
    scheduled_at: string;
    ends_at: string;
    rota_id: string;
    rota: { name: string; tz: string } | null;
  } | null;
};

export function useSwapRequest(swapId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['swap-request', swapId],
    queryFn: async () => {
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
      return data as unknown as SwapRequestDetail;
    },
    enabled: !!session && !!swapId,
  });
}

export function usePendingSwapsForMe() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = ['pending-swaps-for-me'] as const;

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const channel = supabase
      .channel('swap-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swap_requests',
          filter: `target_user_id=eq.${uid}` },
        () => queryClient.invalidateQueries({ queryKey: key })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('swap_requests')
        .select(
          'id, occurrence_id, requester_id, message, created_at,' +
          'requester:profiles!swap_requests_requester_id_fkey(display_name),' +
          'occurrence:occurrences(scheduled_at, ends_at, rota_id, rota:rotas(name, tz))'
        )
        .eq('target_user_id', session!.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PendingSwapForMe[];
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
      queryClient.invalidateQueries({ queryKey: ['occurrence', occurrenceId] });
      queryClient.invalidateQueries({ queryKey: ['occurrences'] });
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
      return data as any;
    },
    onSuccess: (occ, { swapId }) => {
      const row = occ as any;
      if (row?.id) queryClient.invalidateQueries({ queryKey: ['occurrence', row.id] });
      if (row?.rota_id) queryClient.invalidateQueries({ queryKey: ['occurrences', row.rota_id] });
      queryClient.invalidateQueries({ queryKey: ['swap-request', swapId] });
      queryClient.invalidateQueries({ queryKey: ['home-rotas'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swaps-for-me'] });
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
      queryClient.invalidateQueries({ queryKey: ['swap-request', swapId] });
      queryClient.invalidateQueries({ queryKey: ['occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swaps-for-me'] });
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
      return data as any;
    },
    onSuccess: (occ, { occurrenceId }) => {
      const row = occ as any;
      queryClient.invalidateQueries({ queryKey: ['occurrence', occurrenceId] });
      if (row?.rota_id) queryClient.invalidateQueries({ queryKey: ['occurrences', row.rota_id] });
      queryClient.invalidateQueries({ queryKey: ['home-rotas'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swaps-for-me'] });
    },
  });
}
