import { useEffect, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { queryKeys } from '@/features/rotas/query-keys';
import { getUserMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type UnavailabilityWindow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  tz: string;
  created_at: string;
};

export type UnavailabilityPublic = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  tz: string;
  created_at: string;
};

/**
 * Shape returned by set_unavailability / update_unavailability.
 *
 * `start_date` / `end_date` are the *stored* dates, which may be wider than
 * what the caller asked for when the window merged with neighbours, and
 * `merged_ids` lists what was absorbed — together they let the UI say
 * "merged into 1–8 Aug" rather than silently changing what the user drew.
 */
export type UpsertUnavailabilityResult = {
  id: string;
  start_date: string;
  end_date: string;
  merged_ids: string[];
  rota_ids: string[];
};

/**
 * Current user's own absence windows, ordered by start_date ascending.
 *
 * Reads the base table directly: RLS ("owner all") scopes it to the caller, and
 * 20260731000001 granted `authenticated` the SELECT this needs. Before that
 * grant every read here failed with 42501 and the empty-array default made it
 * look like the user simply had no away windows.
 *
 * Read-only. Pair with useRegisterMyUnavailabilityRealtime on the screen that
 * needs live updates — the conflict primitive reads this from several screens
 * at once, so subscribing here would open a channel per mount.
 */
export function useMyUnavailability() {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.unavailability.mine(),
    queryFn: async (): Promise<UnavailabilityWindow[]> => {
      const { data, error } = await supabase
        .from('user_unavailability')
        .select('id, user_id, start_date, end_date, reason, tz, created_at')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!session,
  });
}

/** Registers the realtime subscription for the caller's own away windows. Call once, at screen level. */
export function useRegisterMyUnavailabilityRealtime() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const id = useId();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unavailability-mine:${userId}:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_unavailability',
          filter: `user_id=eq.${userId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: queryKeys.unavailability.mine() }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, id]);
}

/** Registers a realtime subscription for unavailability changes on a rota. Call once at screen level. */
export function useRegisterUnavailabilityRealtime(rotaId: string | null | undefined) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session || !rotaId) return;
    const channel = supabase
      .channel(`unavailability-rota:${rotaId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_unavailability',
        },
        () =>
          queryClient.invalidateQueries({ queryKey: queryKeys.unavailability.forRota(rotaId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rotaId, session?.user.id, queryClient]);
}

/** Upcoming absence windows for all members of a rota (public view, no reason). */
export function useRotaMemberUnavailability(rotaId: string | null | undefined) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.unavailability.forRota(rotaId ?? ''),
    queryFn: async (): Promise<UnavailabilityPublic[]> => {
      const { data: members, error: membersError } = await supabase
        .from('rota_members')
        .select('user_id')
        .eq('rota_id', rotaId!)
        .not('user_id', 'is', null);
      if (membersError) throw membersError;

      const memberIds = (members ?? [])
        .map((m) => m.user_id)
        .filter(Boolean) as string[];

      if (memberIds.length === 0) return [];

      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // The public view omits `reason`. Since 20260731000001 it also runs with
      // security_invoker, so RLS restricts it to rota peers — the member filter
      // below is now belt-and-braces rather than the only thing protecting it.
      const { data, error } = await supabase
        .from('user_unavailability_public')
        .select('id, user_id, start_date, end_date, tz, created_at')
        .in('user_id', memberIds)
        .lte('start_date', future)
        .gte('end_date', today)
        .order('start_date', { ascending: true });
      if (error) throw error;

      return (data ?? []).filter(
        (row): row is UnavailabilityPublic =>
          row.id !== null &&
          row.user_id !== null &&
          row.start_date !== null &&
          row.end_date !== null &&
          row.tz !== null &&
          row.created_at !== null,
      );
    },
    enabled: !!session && !!rotaId,
  });
}

/**
 * Invalidates every query that depends on a user's own away windows.
 *
 * Note what is deliberately absent: this no longer re-materializes the affected
 * rotas. Passing an `invalidate_window` to materialize-rota made it discard and
 * recompute existing assignments, so marking yourself away silently handed your
 * shifts to someone else. Occurrences generated later still skip absent members
 * (isUserAbsent runs when the round-robin picks an assignee for a row that does
 * not exist yet); existing turns are now flagged as conflicts instead, and the
 * user chooses whether to request cover. See docs/plan/10-availability.md.
 */
function invalidateUnavailability(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.unavailability.mine() });
  queryClient.invalidateQueries({ queryKey: ['unavailability', 'rota'] });
}

/** Mutation: creates an away window, merging it into any it overlaps or touches. */
export function useSetUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      startDate,
      endDate,
      reason,
      tz,
    }: {
      startDate: string;
      endDate: string;
      reason?: string | null;
      tz: string;
    }): Promise<UpsertUnavailabilityResult> => {
      const { data, error } = await supabase.rpc('set_unavailability', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_reason: reason ?? undefined,
        p_tz: tz,
      });
      if (error) throw new Error(getUserMessage(error));
      return data as unknown as UpsertUnavailabilityResult;
    },
    onSuccess: () => invalidateUnavailability(queryClient),
  });
}

/** Mutation: edits an existing away window in place (owner-gated server-side). */
export function useUpdateUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      unavailabilityId,
      startDate,
      endDate,
      reason,
      tz,
    }: {
      unavailabilityId: string;
      startDate: string;
      endDate: string;
      reason?: string | null;
      tz: string;
    }): Promise<UpsertUnavailabilityResult> => {
      const { data, error } = await supabase.rpc('update_unavailability', {
        p_unavailability_id: unavailabilityId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_reason: reason ?? undefined,
        p_tz: tz,
      });
      if (error) throw new Error(getUserMessage(error));
      return data as unknown as UpsertUnavailabilityResult;
    },
    onSuccess: () => invalidateUnavailability(queryClient),
  });
}

/** Mutation: deletes an away window. Any cover requests already opened stay open. */
export function useClearUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      unavailabilityId,
    }: {
      unavailabilityId: string;
    }): Promise<{ rota_ids: string[] }> => {
      const { data, error } = await supabase.rpc('clear_unavailability', {
        p_unavailability_id: unavailabilityId,
      });
      if (error) throw new Error(getUserMessage(error));
      return data as unknown as { rota_ids: string[] };
    },
    onSuccess: () => invalidateUnavailability(queryClient),
  });
}
