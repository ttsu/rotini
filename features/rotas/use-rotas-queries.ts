import { useId, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import { useScheduledInvalidation } from '@/hooks/use-scheduled-invalidation';
import { queryKeys } from './query-keys';

export type OccurrenceRow = {
  id: string;
  rota_id: string;
  scheduled_at: string;
  ends_at: string;
  scheduled_local_date: string;
  assigned_user_id: string | null;
  status: string;
};

export function useRotas() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.rotas.all();
  const id = useId();

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel(`rotas-members-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rota_members', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, queryClient]);

  useScheduledInvalidation(key);

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_members')
        .select(
          'role, rota:rotas!rota_members_rota_id_fkey(id, name, description, tz, duration_minutes, assignment_mode, created_at)',
        )
        .eq('user_id', session!.user.id)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return data.filter((row) => row.rota !== null) as {
        role: string;
        rota: {
          id: string;
          name: string;
          description: string | null;
          tz: string;
          duration_minutes: number | null;
          assignment_mode: string;
          created_at: string;
        };
      }[];
    },
    enabled: !!session,
  });
}

export function useRotaData(rotaId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.rotas.detail(rotaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rotas')
        .select(`*, rota_members(*, profile:profiles(id, display_name, avatar_url))`)
        .eq('id', rotaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!session && !!rotaId,
  });
}

/** @deprecated Prefer `useRotaData`; rota member realtime is owned by `RotaRealtimeRoot`. */
export function useRota(rotaId: string) {
  return useRotaData(rotaId);
}

export function useRotaOccurrences(rotaId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.occurrences.forRota(rotaId),
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from('occurrences')
        .select(
          'id, rota_id, scheduled_at, ends_at, scheduled_local_date, status, assigned_user_id',
        )
        .eq('rota_id', rotaId)
        .gte('ends_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as OccurrenceRow[];
    },
    enabled: !!session && !!rotaId,
  });
}
