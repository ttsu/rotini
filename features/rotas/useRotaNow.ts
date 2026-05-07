import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth';

/** Per-rota `v_rota_now` realtime refresh is handled by `RotaRealtimeRoot` (occurrences + members). */

export type RotaNowRow = {
  rota_id: string;
  active_occurrence_id: string | null;
  active_scheduled_at: string | null;
  active_ends_at: string | null;
  active_assignee_id: string | null;
  active_assignee_name: string | null;
  upcoming_occurrence_id: string | null;
  upcoming_scheduled_at: string | null;
  upcoming_ends_at: string | null;
  upcoming_assignee_id: string | null;
  upcoming_assignee_name: string | null;
};

function useBoundaryTimer(boundary: string | null | undefined, queryKey: unknown[]) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!boundary) return;
    const ms = new Date(boundary).getTime() - Date.now();
    if (ms <= 0) {
      queryClient.invalidateQueries({ queryKey });
      return;
    }
    timerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
    }, ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [boundary, queryKey, queryClient]);
}

function useAppStateInvalidation(queryKey: unknown[]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        queryClient.invalidateQueries({ queryKey });
      }
    });
    return () => sub.remove();
  }, [queryKey, queryClient]);
}

// Single-rota hook used in rota detail screen.
export function useRotaNow(rotaId: string) {
  const key = ['rota-now', rotaId];

  useAppStateInvalidation(key);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_rota_now')
        .select('*')
        .eq('rota_id', rotaId)
        .maybeSingle();
      if (error) throw error;
      return data as RotaNowRow | null;
    },
    enabled: !!rotaId,
  });

  const d = query.data;
  const boundary = d?.active_occurrence_id ? d.active_ends_at : d?.upcoming_scheduled_at;
  useBoundaryTimer(boundary, key);

  return query;
}

// All-rotas hook for the home screen — one consolidated boundary timer.
export function useAllRotasNow() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = ['all-rotas-now'];

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel('rota-now-all-occ')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () =>
        queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, queryClient]);

  useAppStateInvalidation(key);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_rota_now').select('*');
      if (error) throw error;
      return (data ?? []) as RotaNowRow[];
    },
    enabled: !!session,
  });

  // Single timer for the earliest boundary across all rotas.
  const rows = query.data ?? [];
  const earliest = rows.reduce<string | null>((acc, row) => {
    const b = row.active_occurrence_id ? row.active_ends_at : row.upcoming_scheduled_at;
    if (!b) return acc;
    if (!acc) return b;
    return b < acc ? b : acc;
  }, null);
  useBoundaryTimer(earliest, key);

  return query;
}
