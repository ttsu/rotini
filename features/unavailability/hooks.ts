import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

const MATERIALIZE_URL = `${supabaseUrl}/functions/v1/materialize-rota`;

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

const unavailabilityKeys = {
  mine: () => ['unavailability', 'mine'] as const,
  forRota: (rotaId: string) => ['unavailability', 'rota', rotaId] as const,
};

/** Fan-out helper: calls materialize-rota for each affected rota_id (fire-and-forget). */
async function fanOutMaterialize(
  rotaIds: string[],
  accessToken: string,
  startDate: string,
  endDate: string,
) {
  for (const rotaId of rotaIds) {
    fetch(MATERIALIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        rota_id: rotaId,
        invalidate_window: { start_date: startDate, end_date: endDate },
      }),
    }).catch(() => {
      // fire-and-forget; ignore errors
    });
  }
}

// Typed REST shim for tables not yet in database.types.ts (added in Unit 31 migration).
// Use the Supabase REST API via fetch rather than the typed .from() overload.
const supabaseRest = {
  async from<T>(table: string, query: string): Promise<T[]> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`REST error ${response.status}`);
    return (await response.json()) as T[];
  },
};

/** Current user's own absence windows, ordered by start_date ascending. */
export function useMyUnavailability() {
  const { session } = useAuth();

  return useQuery({
    queryKey: unavailabilityKeys.mine(),
    queryFn: async (): Promise<UnavailabilityWindow[]> => {
      // user_unavailability has RLS — only returns the current user's rows
      const rows = await supabaseRest.from<UnavailabilityWindow>(
        'user_unavailability',
        'select=id,user_id,start_date,end_date,reason,tz,created_at&order=start_date.asc',
      );
      return rows;
    },
    enabled: !!session,
  });
}

/** Upcoming absence windows for all members of a rota (public view, no reason). */
export function useRotaMemberUnavailability(rotaId: string | null | undefined) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = unavailabilityKeys.forRota(rotaId ?? '');

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
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rotaId, session?.user.id, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<UnavailabilityPublic[]> => {
      // Get the members of this rota first, then fetch their unavailability
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

      // user_unavailability_public is a view not yet in database.types.ts
      const inList = memberIds.join(',');
      const rows = await supabaseRest.from<UnavailabilityPublic>(
        'user_unavailability_public',
        `select=id,user_id,start_date,end_date,tz,created_at&user_id=in.(${inList})&start_date=lte.${future}&end_date=gte.${today}&order=start_date.asc`,
      );
      return rows;
    },
    enabled: !!session && !!rotaId,
  });
}

/** Mutation: calls set_unavailability RPC, triggers fan-out, invalidates query. */
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
    }): Promise<{ id: string; rota_ids: string[] }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/set_unavailability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          reason: reason ?? null,
          tz,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `RPC error ${response.status}`);
      }
      return (await response.json()) as { id: string; rota_ids: string[] };
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: unavailabilityKeys.mine() });
      // Invalidate all rota unavailability queries
      queryClient.invalidateQueries({ queryKey: ['unavailability', 'rota'] });

      // Fan-out: trigger materialize-rota for each affected rota
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token && data?.rota_ids?.length) {
        void fanOutMaterialize(data.rota_ids, token, variables.startDate, variables.endDate);
      }
    },
  });
}

/** Mutation: calls clear_unavailability RPC, triggers fan-out, invalidates query. */
export function useClearUnavailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      unavailabilityId,
    }: {
      unavailabilityId: string;
    }): Promise<{ rota_ids: string[] }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/clear_unavailability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({ unavailability_id: unavailabilityId }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `RPC error ${response.status}`);
      }
      return (await response.json()) as { rota_ids: string[] };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: unavailabilityKeys.mine() });
      queryClient.invalidateQueries({ queryKey: ['unavailability', 'rota'] });

      // Fan-out: trigger materialize-rota for each affected rota
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token && data?.rota_ids?.length) {
        // Use a wide window since we cleared an absence
        const today = new Date().toISOString().slice(0, 10);
        const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        void fanOutMaterialize(data.rota_ids, token, today, future);
      }
    },
  });
}
