import { useEffect, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { parseMyOccurrences, type MyOccurrence } from '@/lib/api-schemas/my-occurrence';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './query-keys';

/**
 * Every upcoming turn assigned to the current user, across all their rotas.
 *
 * Backs the availability conflict primitive, which needs the whole list rather
 * than the next turn per rota.
 *
 * Note: `useHomeRotas` already runs this exact query and then keeps only the
 * first occurrence per rota (see `deriveHomeRotas`). Composing the two is worth
 * doing, but not as a drive-by on the highest-traffic screen in the app — the
 * duplicate is one small indexed query. Tracked as follow-up.
 */
export function useMyUpcomingOccurrences() {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.occurrences.mine(),
    queryFn: async (): Promise<MyOccurrence[]> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select('id, rota_id, scheduled_at, ends_at, status, rota:rotas!occurrences_rota_id_fkey(name, tz)')
        .eq('assigned_user_id', session!.user.id)
        .gte('ends_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return parseMyOccurrences(data ?? []);
    },
    enabled: !!session,
  });
}

/**
 * Registers the realtime subscription for the caller's own occurrences.
 * Call once, at screen level.
 *
 * Kept out of useMyUpcomingOccurrences because the conflict primitive reads
 * that query from several screens at once, and one channel per mount is waste
 * at best and a collision at worst — see useRegisterSentSwapsRealtime.
 */
export function useRegisterMyOccurrencesRealtime() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.occurrences.mine();
  const id = useId();

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`my-occurrences:${session.user.id}:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () =>
        queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, queryClient, id]);
}
