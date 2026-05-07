import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';

type ChannelPair = {
  members: RealtimeChannel;
  occurrences: RealtimeChannel;
};

type RotaRealtimeContextValue = {
  register: (rotaId: string) => void;
  unregister: (rotaId: string) => void;
};

const RotaRealtimeContext = createContext<RotaRealtimeContextValue | null>(null);

/**
 * Owns per-rota Supabase Realtime channels for the rotas navigation subtree so
 * multiple screens never attach duplicate `postgres_changes` handlers to the
 * same channel topic. Also invalidates `v_rota_now` (`['rota-now', rotaId]`)
 * from the same occurrence/member filters used on the detail screen.
 */
export function RotaRealtimeRoot({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const refCounts = useRef(new Map<string, number>());
  const channels = useRef(new Map<string, ChannelPair>());

  const sessionUserId = session?.user.id;

  const teardownRota = useCallback((rotaId: string) => {
    const pair = channels.current.get(rotaId);
    if (!pair) return;
    supabase.removeChannel(pair.members);
    supabase.removeChannel(pair.occurrences);
    channels.current.delete(rotaId);
  }, []);

  const subscribeRota = useCallback(
    (rotaId: string) => {
      if (!sessionUserId || channels.current.has(rotaId)) return;

      const invalidateRotaQueries = () => {
        queryClient.invalidateQueries({ queryKey: ['rotas', rotaId] });
        queryClient.invalidateQueries({ queryKey: ['rota-now', rotaId] });
      };

      const membersCh = supabase
        .channel(`rota_members:${rotaId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rota_members',
            filter: `rota_id=eq.${rotaId}`,
          },
          invalidateRotaQueries,
        )
        .subscribe();

      const occurrencesCh = supabase
        .channel(`occurrences-list:${rotaId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'occurrences',
            filter: `rota_id=eq.${rotaId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['occurrences', rotaId] });
            queryClient.invalidateQueries({ queryKey: ['rota-now', rotaId] });
          },
        )
        .subscribe();

      channels.current.set(rotaId, { members: membersCh, occurrences: occurrencesCh });
    },
    [sessionUserId, queryClient],
  );

  const register = useCallback(
    (rotaId: string) => {
      const next = (refCounts.current.get(rotaId) ?? 0) + 1;
      refCounts.current.set(rotaId, next);
      if (next === 1 && sessionUserId) {
        subscribeRota(rotaId);
      }
    },
    [sessionUserId, subscribeRota],
  );

  const unregister = useCallback(
    (rotaId: string) => {
      const prev = refCounts.current.get(rotaId) ?? 0;
      const next = prev - 1;
      if (next <= 0) {
        refCounts.current.delete(rotaId);
        teardownRota(rotaId);
      } else {
        refCounts.current.set(rotaId, next);
      }
    },
    [teardownRota],
  );

  useEffect(() => {
    if (sessionUserId) return;
    for (const rotaId of [...channels.current.keys()]) {
      teardownRota(rotaId);
    }
  }, [sessionUserId, teardownRota]);

  useEffect(() => {
    if (!sessionUserId) return;
    for (const [rotaId, count] of refCounts.current) {
      if (count > 0) {
        subscribeRota(rotaId);
      }
    }
  }, [sessionUserId, subscribeRota]);

  const value = useMemo(() => ({ register, unregister }), [register, unregister]);

  return <RotaRealtimeContext.Provider value={value}>{children}</RotaRealtimeContext.Provider>;
}

/**
 * Registers interest in realtime invalidation for a rota while mounted.
 * Pass `null` while the rota id is not yet known.
 */
export function useRegisterRotaRealtime(rotaId: string | null) {
  const ctx = useContext(RotaRealtimeContext);
  if (!ctx) {
    throw new Error('useRegisterRotaRealtime must be used within RotaRealtimeRoot');
  }

  const { register, unregister } = ctx;

  useEffect(() => {
    if (!rotaId) return;
    register(rotaId);
    return () => {
      unregister(rotaId);
    };
  }, [rotaId, register, unregister]);
}
